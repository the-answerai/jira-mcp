import axios, { AxiosInstance } from 'axios';
import { SearchIssuesResponse, CleanJiraIssue, CleanComment } from '../types/jira.js';

export class JiraApiService {
  private client: AxiosInstance;

  constructor(baseUrl: string, email: string, apiToken: string) {
    // Construct auth header using email and token
    const auth = Buffer.from(`${email}:${apiToken}`).toString('base64');

    this.client = axios.create({
      baseURL: baseUrl,
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });
  }

  private handleAxiosError(error: unknown): never {
    if (!axios.isAxiosError(error)) {
      throw error;
    }

    // First, check for network errors
    if (!error.response || error.message === 'Network Error') {
      throw new Error('JIRA API Error: Network Error');
    }

    // Now we know we have a response, handle HTTP errors
    const { response } = error;

    // Handle 404 for issue endpoints
    if (response.status === 404 && error.config?.url?.includes('/issue/')) {
      const match = error.config.url.match(/\/issue\/([^/]+)/);
      if (match) {
        throw new Error(`Issue not found: ${match[1]}`);
      }
    }

    // Extract error message from response with more details
    const message = response.data?.message || response.data?.errorMessage || error.message;
    const details = JSON.stringify(response.data, null, 2);
    console.error('JIRA API Error Details:', details);
    throw new Error(`JIRA API Error: ${message} (Status: ${response.status})`);
  }

  /**
   * Extracts issue mentions from Atlassian document content
   * Looks for nodes that were auto-converted to issue links
   */
  private extractIssueMentions(content: any[], source: 'description' | 'comment', commentId?: string): CleanJiraIssue['relatedIssues'] {
    const mentions: NonNullable<CleanJiraIssue['relatedIssues']> = [];
    
    // Recursively process content nodes
    const processNode = (node: any) => {
      // Check for inlineCard nodes (auto-converted issue mentions)
      if (node.type === 'inlineCard' && node.attrs?.url) {
        const match = node.attrs.url.match(/\/browse\/([A-Z]+-\d+)/);
        if (match) {
          mentions.push({
            key: match[1],
            type: 'mention',
            source,
            commentId
          });
        }
      }
      
      // Check for text nodes that might contain issue keys
      if (node.type === 'text' && node.text) {
        const matches = node.text.match(/[A-Z]+-\d+/g) || [];
        matches.forEach((key: string) => {
          mentions.push({
            key,
            type: 'mention',
            source,
            commentId
          });
        });
      }
      
      // Process child nodes
      if (node.content) {
        node.content.forEach(processNode);
      }
    };

    content.forEach(processNode);
    return [...new Map(mentions.map(m => [m.key, m])).values()]; // Remove duplicates
  }

  private cleanComment(comment: { 
    id: string;
    body?: { 
      content?: any[];
    };
    author?: { 
      displayName?: string;
    };
    created: string;
    updated: string;
  }): CleanComment {
    const body = comment.body?.content ? 
      this.extractTextContent(comment.body.content) : 
      '';
    const mentions = comment.body?.content ? 
      this.extractIssueMentions(comment.body.content, 'comment', comment.id) : 
      [];

    return {
      id: comment.id,
      body,
      author: comment.author?.displayName,
      created: comment.created,
      updated: comment.updated,
      mentions: mentions
    };
  }

  /**
   * Recursively extracts text content from Atlassian Document Format nodes
   */
  private extractTextContent(content: any[]): string {
    if (!Array.isArray(content)) return '';
    
    return content.map(node => {
      if (node.type === 'text') {
        return node.text || '';
      }
      if (node.content) {
        return this.extractTextContent(node.content);
      }
      return '';
    }).join('');
  }

  private cleanIssue(issue: any): CleanJiraIssue {
    const description = issue.fields?.description?.content ? 
      this.extractTextContent(issue.fields.description.content) : 
      '';
    
    const cleanedIssue: CleanJiraIssue = {
      id: issue.id,
      key: issue.key,
      summary: issue.fields?.summary,
      status: issue.fields?.status?.name,
      created: issue.fields?.created,
      updated: issue.fields?.updated,
      description,
      relatedIssues: []
    };

    // Extract mentions from description
    if (issue.fields?.description?.content) {
      const mentions = this.extractIssueMentions(issue.fields.description.content, 'description');
      if (mentions.length > 0) {
        cleanedIssue.relatedIssues = mentions;
      }
    }

    // Add formal issue links if they exist
    if (issue.fields?.issuelinks?.length > 0) {
      const links = issue.fields.issuelinks.map((link: any) => {
        const linkedIssue = link.inwardIssue || link.outwardIssue;
        const relationship = link.type.inward || link.type.outward;
        return {
          key: linkedIssue.key,
          summary: linkedIssue.fields?.summary,
          type: 'link' as const,
          relationship,
          source: 'description' as const
        };
      });

      cleanedIssue.relatedIssues = [
        ...(cleanedIssue.relatedIssues || []),
        ...links
      ];
    }

    // Add parent if exists
    if (issue.fields?.parent) {
      cleanedIssue.parent = {
        id: issue.fields.parent.id,
        key: issue.fields.parent.key,
        summary: issue.fields.parent.fields?.summary
      };
    }

    // Add epic link if exists
    if (issue.fields?.customfield_10014) { // Epic Link field
      cleanedIssue.epicLink = {
        id: issue.fields.customfield_10014,
        key: issue.fields.customfield_10014,
        summary: undefined // We'll need a separate request to get epic details
      };
    }

    // Add subtasks if exist
    if (issue.fields?.subtasks?.length > 0) {
      cleanedIssue.children = issue.fields.subtasks.map((subtask: any) => ({
        id: subtask.id,
        key: subtask.key,
        summary: subtask.fields?.summary
      }));
    }

    return cleanedIssue;
  }

  async searchIssues(searchString: string): Promise<SearchIssuesResponse> {
    try {
      const response = await this.client.get('/rest/api/3/search', {
        params: {
          jql: searchString,
          maxResults: 50,
          fields: [
            'id', 'key', 'summary', 'description', 'status', 
            'created', 'updated', 'parent', 'subtasks',
            'customfield_10014', // Epic Link field
            'issuelinks' // For formal issue links
          ],
          expand: 'names,renderedFields'
        }
      });
      
      return {
        total: response.data.total,
        issues: response.data.issues.map((issue: any) => this.cleanIssue(issue))
      };
    } catch (error) {
      this.handleAxiosError(error);
    }
  }

  async getEpicChildren(epicKey: string): Promise<CleanJiraIssue[]> {
    try {
      // First get all child issues
      const response = await this.client.get('/rest/api/3/search', {
        params: {
          jql: `"Epic Link" = ${epicKey}`,
          maxResults: 100,
          fields: [
            'id', 'key', 'summary', 'description', 'status', 
            'created', 'updated', 'parent', 'subtasks',
            'customfield_10014', // Epic Link field
            'issuelinks' // For formal issue links
          ],
          expand: 'names,renderedFields'
        }
      });

      // Get comments for each child issue
      const issuesWithComments = await Promise.all(
        response.data.issues.map(async (issue: any) => {
          const commentsResponse = await this.client.get(`/rest/api/3/issue/${issue.key}/comment`);
          const cleanedIssue = this.cleanIssue(issue);
          const comments = commentsResponse.data.comments.map((comment: any) => 
            this.cleanComment(comment)
          );
          
          // Add comment mentions to related issues
          const commentMentions = comments.flatMap((comment: CleanComment) => comment.mentions);
          cleanedIssue.relatedIssues = [
            ...cleanedIssue.relatedIssues,
            ...commentMentions
          ];
          
          cleanedIssue.comments = comments;
          return cleanedIssue;
        })
      );

      return issuesWithComments;
    } catch (error) {
      this.handleAxiosError(error);
    }
  }

  async getIssueWithComments(issueId: string): Promise<CleanJiraIssue> {
    try {
      // Get issue with expanded fields for relationships
      const [issueResponse, commentsResponse] = await Promise.all([
        this.client.get(`/rest/api/3/issue/${issueId}`, {
          params: {
            fields: [
              'id', 'key', 'summary', 'description', 'status', 
              'created', 'updated', 'parent', 'subtasks',
              'customfield_10014', // Epic Link field
              'issuelinks' // For formal issue links
            ],
            expand: 'names,renderedFields'
          }
        }),
        this.client.get(`/rest/api/3/issue/${issueId}/comment`)
      ]);

      const issue = this.cleanIssue(issueResponse.data);
      const comments = commentsResponse.data.comments.map((comment: any) => 
        this.cleanComment(comment)
      );

      // Add comment mentions to related issues
          const commentMentions = comments.flatMap((comment: CleanComment) => comment.mentions);
          issue.relatedIssues = [
            ...issue.relatedIssues,
            ...commentMentions
          ];

      issue.comments = comments;

      // If there's an epic link, fetch its details
      if (issue.epicLink) {
        try {
          const epicResponse = await this.client.get(`/rest/api/3/issue/${issue.epicLink.key}`, {
            params: {
              fields: ['summary']
            }
          });
          issue.epicLink.summary = epicResponse.data.fields?.summary;
        } catch (error) {
          console.error('Failed to fetch epic details:', error);
        }
      }

      return issue;
    } catch (error) {
      this.handleAxiosError(error);
    }
  }
}
