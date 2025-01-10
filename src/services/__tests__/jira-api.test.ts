import { JiraApiService } from '../jira-api.js';

const mockFormattedDescription = {
  fields: {
    description: {
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'As a '
            },
            {
              type: 'text',
              text: 'user',
              marks: [{ type: 'em' }]
            },
            {
              type: 'text',
              text: ' I want to see formatted text'
            }
          ]
        }
      ]
    }
  }
};
import MockAdapter from 'axios-mock-adapter';

describe('JiraApiService', () => {
  describe('cleanIssue', () => {
    it('should properly handle formatted text in description', () => {
      const service = new JiraApiService('http://test', 'test@test.com', 'token');
      const result = (service as any).cleanIssue(mockFormattedDescription);
      expect(result.description).toBe('As a user I want to see formatted text');
    });
  });

  const baseUrl = 'https://your-domain.atlassian.net';
  const apiToken = 'test-token';
  const email = 'user@domain.net';
  let service: JiraApiService;
  let mock: MockAdapter;

  beforeEach(() => {
    service = new JiraApiService(baseUrl, email, apiToken);
    // @ts-ignore - accessing private property for testing
    mock = new MockAdapter(service.client);
  });

  afterEach(() => {
    mock.reset();
  });

  describe('constructor', () => {
    it('should set up axios instance with correct base URL and auth header', async () => {
      // Test the actual request to verify headers
      mock.onGet('/rest/api/3/search').reply(config => {
        expect(config.baseURL).toBe(baseUrl);
        expect(config.headers?.Authorization).toBe(`Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`);
        expect(config.headers?.['Content-Type']).toBe('application/json');
        return [200, { issues: [] }];
      });

      await service.searchIssues('project = TEST');
    });
  });

  describe('searchIssues', () => {
    it('should make GET request to correct endpoint and clean response', async () => {
      const mockResponse = {
        issues: [
          {
            id: '1',
            key: 'TEST-1',
            fields: {
              summary: 'Test Issue',
              status: { name: 'Open' },
              created: '2024-01-01T00:00:00.000Z',
              updated: '2024-01-01T00:00:00.000Z',
              parent: {
                id: 'parent-1',
                key: 'TEST-PARENT',
                fields: {
                  summary: 'Parent Issue'
                }
              },
              subtasks: [
                {
                  id: 'child-1',
                  key: 'TEST-CHILD',
                  fields: {
                    summary: 'Child Issue'
                  }
                }
              ],
              customfield_10014: 'EPIC-1',
              description: {
                content: [{
                  type: 'paragraph',
                  content: [{
                    type: 'text',
                    text: 'Test Description with mention of TEST-2'
                  }, {
                    type: 'inlineCard',
                    attrs: {
                      url: '/browse/TEST-3'
                    }
                  }]
                }]
              },
              issuelinks: [{
                type: {
                  inward: 'is blocked by'
                },
                inwardIssue: {
                  key: 'TEST-4',
                  fields: {
                    summary: 'Blocking Issue'
                  }
                }
              }]
            }
          }
        ],
        total: 1
      };

      const expectedResponse = {
        total: 1,
        issues: [{
          id: '1',
          key: 'TEST-1',
          summary: 'Test Issue',
          description: 'Test Description with mention of TEST-2',
          status: 'Open',
          created: '2024-01-01T00:00:00.000Z',
          updated: '2024-01-01T00:00:00.000Z',
          parent: {
            id: 'parent-1',
            key: 'TEST-PARENT',
            summary: 'Parent Issue'
          },
          children: [
            {
              id: 'child-1',
              key: 'TEST-CHILD',
              summary: 'Child Issue'
            }
          ],
          epicLink: {
            id: 'EPIC-1',
            key: 'EPIC-1',
            summary: undefined
          },
          relatedIssues: [
            {
              key: 'TEST-2',
              type: 'mention',
              source: 'description'
            },
            {
              key: 'TEST-3',
              type: 'mention',
              source: 'description'
            },
            {
              key: 'TEST-4',
              summary: 'Blocking Issue',
              type: 'link',
              relationship: 'is blocked by',
              source: 'description'
            }
          ]
        }]
      };

      mock.onGet('/rest/api/3/search').reply(200, mockResponse);

      const result = await service.searchIssues('project = TEST');
      expect(result).toEqual(expectedResponse);
    });

    it('should handle error responses', async () => {
      mock.onGet('/rest/api/3/search').reply(403, {
        message: 'You do not have permission'
      });

      await expect(service.searchIssues('project = TEST')).rejects.toThrow('JIRA API Error: You do not have permission');
    });
  });

  describe('getEpicChildren', () => {
    const epicKey = 'TEST-1';
    const mockResponse = {
      issues: [
        {
          id: '2',
          key: 'TEST-2',
          fields: {
            summary: 'Child Issue',
            description: {
              content: [{
                type: 'paragraph',
                content: [{
                  type: 'text',
                  text: 'Child Description'
                }]
              }]
            },
            status: { name: 'Open' },
            created: '2024-01-01T00:00:00.000Z',
            updated: '2024-01-01T00:00:00.000Z'
          }
        }
      ],
      total: 1
    };

    const mockComments = {
      comments: [
        {
          id: '1',
          body: {
            content: [{
              type: 'paragraph',
              content: [{
                type: 'text',
                text: 'Test Comment mentioning TEST-5'
              }, {
                type: 'inlineCard',
                attrs: {
                  url: '/browse/TEST-6'
                }
              }]
            }]
          },
          author: { displayName: 'Test User' },
          created: '2024-01-01T00:00:00.000Z',
          updated: '2024-01-01T00:00:00.000Z'
        }
      ]
    };

    it('should fetch epic children with comments', async () => {
      mock.onGet('/rest/api/3/search').reply(200, mockResponse);
      mock.onGet('/rest/api/3/issue/TEST-2/comment').reply(200, mockComments);

      const expectedResponse = [{
        id: '2',
        key: 'TEST-2',
        summary: 'Child Issue',
        description: 'Child Description',
        status: 'Open',
        created: '2024-01-01T00:00:00.000Z',
        updated: '2024-01-01T00:00:00.000Z',
        comments: [{
          id: '1',
          body: 'Test Comment mentioning TEST-5',
          author: 'Test User',
          created: '2024-01-01T00:00:00.000Z',
          updated: '2024-01-01T00:00:00.000Z',
          mentions: [
            {
              key: 'TEST-5',
              type: 'mention',
              source: 'comment',
              commentId: '1'
            },
            {
              key: 'TEST-6',
              type: 'mention',
              source: 'comment',
              commentId: '1'
            }
          ]
        }],
        relatedIssues: [
          {
            key: 'TEST-5',
            type: 'mention',
            source: 'comment',
            commentId: '1'
          },
          {
            key: 'TEST-6',
            type: 'mention',
            source: 'comment',
            commentId: '1'
          }
        ]
      }];

      const result = await service.getEpicChildren(epicKey);
      expect(result).toEqual(expectedResponse);
    });

    it('should handle error responses', async () => {
      mock.onGet('/rest/api/3/search').reply(403, {
        message: 'You do not have permission'
      });

      await expect(service.getEpicChildren(epicKey)).rejects.toThrow('JIRA API Error: You do not have permission');
    });
  });

  describe('getIssueWithComments', () => {
    const issueId = 'TEST-1';
    const mockIssue = {
      id: '1',
      key: 'TEST-1',
      fields: {
        summary: 'Test Issue',
        description: {
          content: [{
            type: 'paragraph',
            content: [{
              type: 'text',
              text: 'Test Description with mention of TEST-7'
            }]
          }]
        },
        status: { name: 'Open' },
        created: '2024-01-01T00:00:00.000Z',
        updated: '2024-01-01T00:00:00.000Z',
        parent: {
          id: 'parent-1',
          key: 'TEST-PARENT',
          fields: {
            summary: 'Parent Issue'
          }
        },
        subtasks: [
          {
            id: 'child-1',
            key: 'TEST-CHILD',
            fields: {
              summary: 'Child Issue'
            }
          }
        ],
        customfield_10014: 'EPIC-1',
        issuelinks: [{
          type: {
            outward: 'blocks'
          },
          outwardIssue: {
            key: 'TEST-8',
            fields: {
              summary: 'Blocked Issue'
            }
          }
        }]
      }
    };

    const mockEpic = {
      fields: {
        summary: 'Epic Issue'
      }
    };

    const mockComments = {
      comments: [
        {
          id: '1',
          body: {
            content: [{
              type: 'paragraph',
              content: [{
                type: 'text',
                text: 'Test Comment mentioning TEST-9'
              }]
            }]
          },
          author: { displayName: 'Test User' },
          created: '2024-01-01T00:00:00.000Z',
          updated: '2024-01-01T00:00:00.000Z'
        }
      ]
    };

    it('should make parallel requests for issue, comments, and epic details', async () => {
      mock.onGet(`/rest/api/3/issue/${issueId}`).reply(200, mockIssue);
      mock.onGet(`/rest/api/3/issue/${issueId}/comment`).reply(200, mockComments);
      mock.onGet('/rest/api/3/issue/EPIC-1').reply(200, mockEpic);

      const result = await service.getIssueWithComments(issueId);
      expect(result).toEqual({
        id: '1',
        key: 'TEST-1',
        summary: 'Test Issue',
        description: 'Test Description with mention of TEST-7',
        status: 'Open',
        created: '2024-01-01T00:00:00.000Z',
        updated: '2024-01-01T00:00:00.000Z',
        parent: {
          id: 'parent-1',
          key: 'TEST-PARENT',
          summary: 'Parent Issue'
        },
        children: [
          {
            id: 'child-1',
            key: 'TEST-CHILD',
            summary: 'Child Issue'
          }
        ],
        epicLink: {
          id: 'EPIC-1',
          key: 'EPIC-1',
          summary: 'Epic Issue'
        },
        comments: [{
          id: '1',
          body: 'Test Comment mentioning TEST-9',
          author: 'Test User',
          created: '2024-01-01T00:00:00.000Z',
          updated: '2024-01-01T00:00:00.000Z',
          mentions: [
            {
              key: 'TEST-9',
              type: 'mention',
              source: 'comment',
              commentId: '1'
            }
          ]
        }],
        relatedIssues: [
          {
            key: 'TEST-7',
            type: 'mention',
            source: 'description'
          },
          {
            key: 'TEST-8',
            summary: 'Blocked Issue',
            type: 'link',
            relationship: 'blocks',
            source: 'description'
          },
          {
            key: 'TEST-9',
            type: 'mention',
            source: 'comment',
            commentId: '1'
          }
        ]
      });
    });

    it('should handle epic fetch failure gracefully', async () => {
      mock.onGet(`/rest/api/3/issue/${issueId}`).reply(200, mockIssue);
      mock.onGet(`/rest/api/3/issue/${issueId}/comment`).reply(200, mockComments);
      mock.onGet('/rest/api/3/issue/EPIC-1').reply(404);

      const result = await service.getIssueWithComments(issueId);
      expect(result.epicLink?.summary).toBeUndefined();
    });

    it('should handle 404 errors correctly', async () => {
      mock.onGet(`/rest/api/3/issue/${issueId}`).reply(404);

      await expect(service.getIssueWithComments(issueId)).rejects.toThrow(`Issue not found: ${issueId}`);
    });

    it('should handle permission errors', async () => {
      mock.onGet(`/rest/api/3/issue/${issueId}`).reply(403, {
        message: 'You do not have permission to view this issue'
      });

      await expect(service.getIssueWithComments(issueId)).rejects.toThrow(
        'JIRA API Error: You do not have permission to view this issue'
      );
    });
  });
});
