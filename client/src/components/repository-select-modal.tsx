import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Github } from "lucide-react";

interface GitHubRepository {
  id: number; // This could be either GitHub ID or internal database ID depending on connection status
  githubId?: string; // GitHub ID (only present if connected)
  name: string;
  full_name: string;
  owner: {
    login: string;
  };
  default_branch?: string;
  pushed_at?: string;
  private: boolean;
  isConnected?: boolean;
}

interface RepositoryCardData {
  id?: number;
  githubId: string;
  name: string;
  full_name: string; // GitHub API format
  owner: { login: string }; // GitHub API format
  default_branch: string; // GitHub API format
  isActive?: boolean;
  isConnected: boolean;
  pushEvents?: number;
  lastPush?: string;
  private: boolean;
  // Add other GitHub API fields that might be present
  [key: string]: any;
}

interface RepositorySelectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRepositorySelect: (repository: RepositoryCardData) => void;
}

export function RepositorySelectModal({
  open,
  onOpenChange,
  onRepositorySelect,
}: RepositorySelectModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch repositories only when modal is open
  const { data: repositories, isLoading, error, refetch } = useQuery({
    queryKey: ["/api/repositories", open], // Include open in the queryKey
    queryFn: async () => {
      if (!open) return []; // Return empty array if modal is closed
      
      const token = localStorage.getItem('token');
      const userId = localStorage.getItem('userId');

      if (!token || !userId) {
        throw new Error('Authentication required. Please log in again.');
      }

      const response = await fetch(`/api/repositories?userId=${userId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        
        if (response.status === 404) {
          throw new Error('No repositories found. Please check your GitHub connection.');
        }
        // If the error indicates an expired token, invalidate the profile query to refresh connection status
        if (errorData.error && errorData.error.includes('expired')) {
          queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
        }
        throw new Error(errorData.error || 'Failed to fetch repositories');
      }

      const data = await response.json();
      
      // Transform the GitHub API response into our expected format
      return (data as GitHubRepository[]).map((repo) => ({
        id: repo.id, // Internal database ID if connected, GitHub ID if not connected
        githubId: repo.githubId || repo.id.toString(), // GitHub ID
        name: repo.name,
        full_name: repo.full_name, // Use GitHub API format
        owner: repo.owner, // Use GitHub API format
        default_branch: repo.default_branch || 'main', // Use GitHub API format
        isActive: true,
        isConnected: repo.isConnected || false,
        pushEvents: 0,
        lastPush: repo.pushed_at || '',
        private: repo.private
      } as RepositoryCardData));
    },
    enabled: open,
    refetchOnWindowFocus: false,
    refetchOnMount: false
  });

  // Reset search query when modal closes and handle OAuth return
  useEffect(() => {
    if (!open) {
      setSearchQuery("");
      // Remove the query data when modal closes
      queryClient.removeQueries({ queryKey: ["/api/repositories", true] });
    } else {
      // When modal opens, refetch repositories to get fresh data
      queryClient.invalidateQueries({ queryKey: ["/api/repositories"] });
      
      // Check if user just returned from GitHub OAuth (check for returnPath)
      const returnPath = localStorage.getItem('returnPath');
      if (returnPath && returnPath.includes('/repositories')) {
        // Clear the return path and refetch data
        localStorage.removeItem('returnPath');
        refetch();
      }
    }
  }, [open, queryClient, refetch]);

  // Filter repositories based on search query
  const filteredRepositories = (repositories || []).filter((repo) =>
    repo.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const [selectedRepoId, setSelectedRepoId] = useState<string | null>(null);

  const handleSelect = async (repo: RepositoryCardData) => {
    try {
      setSelectedRepoId(repo.githubId);
      
      // Format repository data according to the API's expected structure
      const repositoryData: RepositoryCardData = {
        ...repo,
        isActive: true,
        isConnected: false,
        branch: repo.branch || 'main'
      };

      await onRepositorySelect(repositoryData);
      
      // Invalidate the repositories query to refresh the list
      queryClient.invalidateQueries({ queryKey: [`/api/repositories?userId=${localStorage.getItem('userId')}`] });
      
      // Close modal after successful selection
      onOpenChange(false);
    } catch (error) {
      console.error('Error selecting repository:', error);
      setSelectedRepoId(null);
      toast({
        title: "Connection Failed",
        description: "Failed to connect repository. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Select Repository</DialogTitle>
          <DialogDescription>
            Choose a repository to connect to PushLog
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          {error ? (
            <div className="flex flex-col items-center justify-center space-y-4 p-8">
              <Github className="w-12 h-12 text-gray-400" />
              <p className="text-center text-gray-600">
                {error instanceof Error && error.message.includes('Authentication required') 
                  ? 'Please authenticate your account below.' 
                  : (error instanceof Error ? error.message : 'Failed to load repositories')
                }
              </p>
              
                              {error instanceof Error && error.message.includes('Authentication required') ? (
                  <div className="text-center">
                  <Button
                    onClick={async () => {
                      try {
                        const token = localStorage.getItem('token');
                        
                        if (!token) {
                          onOpenChange(false);
                          window.location.href = '/login';
                          return;
                        }

                        const response = await fetch('/api/github/connect', {
                          headers: {
                            'Authorization': `Bearer ${token}`,
                            'Accept': 'application/json'
                          }
                        });

                        const data = await response.json();

                        if (response.status === 401) {
                          localStorage.removeItem('token');
                          onOpenChange(false);
                          window.location.href = '/login';
                          return;
                        }

                        if (!response.ok) {
                          if (response.status === 400 && data.error === "GitHub account already connected") {
                            toast({
                              title: "GitHub Already Connected",
                              description: "Try refreshing the page to fetch your repositories.",
                              variant: "default",
                            });
                            window.location.reload();
                            return;
                          }
                          throw new Error(data.error || 'Failed to connect to GitHub');
                        }

                        if (data.url) {
                          // Store the state for verification in the callback
                          if (data.state) {
                            localStorage.setItem('github_oauth_state', data.state);
                          }
                          localStorage.setItem('returnPath', window.location.pathname);
                          window.location.href = data.url;
                        }
                      } catch (error) {
                        console.error('Failed to connect GitHub:', error);
                        toast({
                          title: "Connection Failed",
                          description: error instanceof Error ? error.message : "Failed to connect to GitHub. Please try again.",
                          variant: "destructive",
                        });
                      }
                    }}
                    className="bg-log-green text-white hover:bg-green-600"
                  >
                    <Github className="w-4 h-4 mr-2" />
                    Re-authenticate GitHub
                  </Button>
                </div>
              ) : 
              
              ((error instanceof Error && error.message.includes('No repositories found')) || 
               (error instanceof Error && error.message.includes('expired'))) ? (
                  <div className="text-center">
                    <p className="text-sm text-gray-500 mb-4">This could mean:</p>
                    <ul className="text-sm text-gray-500 list-disc list-inside mb-4">
                      <li>You haven't created any repositories yet</li>
                      <li>Your GitHub token needs to be refreshed</li>
                    </ul>
                    <Button
                      onClick={async () => {
                        try {
                          const token = localStorage.getItem('token');
                          
                          if (!token) {
                            toast({
                              title: "Authentication Required",
                              description: "Please log in to connect your GitHub account.",
                              variant: "destructive",
                            });
                            onOpenChange(false);
                            window.location.href = '/login';
                            return;
                          }

                          const response = await fetch('/api/github/connect', {
                            headers: {
                              'Authorization': `Bearer ${token}`,
                              'Accept': 'application/json'
                            }
                          });

                          const data = await response.json();

                          if (response.status === 401) {
                            localStorage.removeItem('token');
                            onOpenChange(false);
                            window.location.href = '/login';
                            return;
                          }

                          if (!response.ok) {
                            if (response.status === 400 && data.error === "GitHub account already connected") {
                              toast({
                                title: "GitHub Already Connected",
                                description: "Try refreshing the page to fetch your repositories.",
                                variant: "default",
                              });
                              window.location.reload();
                              return;
                            }
                            throw new Error(data.error || 'Failed to connect to GitHub');
                          }

                          if (data.url) {
                            // Store the state for verification in the callback
                            if (data.state) {
                              localStorage.setItem('github_oauth_state', data.state);
                            }
                            localStorage.setItem('returnPath', window.location.pathname);
                            window.location.href = data.url;
                          }
                        } catch (error) {
                          console.error('Failed to connect GitHub:', error);
                          toast({
                            title: "Connection Failed",
                            description: error instanceof Error ? error.message : "Failed to connect to GitHub. Please try again.",
                            variant: "destructive",
                          });
                        }
                      }}
                    >
                      Refresh GitHub Connection
                    </Button>
                  </div>
              ) : null}
            </div>
          ) : (
            <>
              <Input
                placeholder="Search repositories..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="mb-4"
              />
              <ScrollArea className="h-[300px] pr-4">
                {isLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <p>Loading repositories...</p>
                  </div>
                ) : filteredRepositories.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <p>No repositories found</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredRepositories.map((repo) => (
                                              <Button
                          key={repo.githubId}
                          variant={repo.isConnected ? "secondary" : "outline"}
                          disabled={repo.isConnected || selectedRepoId === repo.githubId}
                          className={`w-full justify-start group pt-6 pb-6 px-4 ${
                            selectedRepoId === repo.githubId 
                              ? 'bg-log-green text-white cursor-wait' 
                              : 'hover:bg-log-green'
                          }`}
                          onClick={() => handleSelect(repo)}
                        >
                        <div className="flex flex-col items-start py-4">
                          <span className="font-medium">{repo.name}</span>
                          <span className="text-sm text-gray-600 group-hover:text-graphite">
                            {repo.owner.login}/{repo.name}
                          </span>
                        </div>
                      </Button>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
} 