export interface CleanComment {
  id: string;
  body: string;
  author: string | undefined;
  created: string;
  updated: string;
  mentions: NonNullable<CleanJiraIssue['relatedIssues']>;
}

export interface CleanJiraIssue {
  id: string;
  key: string;
  summary: string | undefined;
  status: string | undefined;
  created: string | undefined;
  updated: string | undefined;
  description: string;
  comments?: CleanComment[];
  parent?: {
    id: string;
    key: string;
    summary?: string;
  };
  children?: {
    id: string;
    key: string;
    summary?: string;
  }[];
  epicLink?: {
    id: string;
    key: string;
    summary?: string;
  };
  relatedIssues: {
    key: string;
    summary?: string;
    type: 'mention' | 'link';
    relationship?: string; // For formal issue links e.g. "blocks", "relates to"
    source: 'description' | 'comment';
    commentId?: string;
  }[];
}

export interface SearchIssuesResponse {
  total: number;
  issues: CleanJiraIssue[];
}
