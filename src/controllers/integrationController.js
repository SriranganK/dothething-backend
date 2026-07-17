const Workspace = require('../models/Workspace');
const Board = require('../models/Board');
const Item = require('../models/Item');

// Get all integration configurations for a workspace
exports.getIntegrations = async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) {
      return res.status(404).json({ message: 'Workspace not found' });
    }

    // Prepare response without exposing raw access tokens
    const github = workspace.integrations?.github ? {
      connected: workspace.integrations.github.connected,
      enabled: workspace.integrations.github.enabled,
      username: workspace.integrations.github.username,
      avatarUrl: workspace.integrations.github.avatarUrl,
      profileUrl: workspace.integrations.github.profileUrl,
      linkedRepos: workspace.integrations.github.linkedRepos || [],
    } : { connected: false, enabled: false, linkedRepos: [] };

    const gitlab = workspace.integrations?.gitlab ? {
      connected: workspace.integrations.gitlab.connected,
      enabled: workspace.integrations.gitlab.enabled,
      username: workspace.integrations.gitlab.username,
      avatarUrl: workspace.integrations.gitlab.avatarUrl,
      profileUrl: workspace.integrations.gitlab.profileUrl,
      linkedRepos: workspace.integrations.gitlab.linkedRepos || [],
    } : { connected: false, enabled: false, linkedRepos: [] };

    res.json({ success: true, integrations: { github, gitlab } });
  } catch (error) {
    console.error('getIntegrations error:', error.message);
    res.status(500).json({ message: 'Server error retrieving integrations info' });
  }
};

// Generate OAuth Authorization URL
exports.authorizePlatform = async (req, res) => {
  try {
    const { workspaceId, platform } = req.params;
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:5000';

    if (platform === 'github') {
      const clientId = process.env.GITHUB_CLIENT_ID;
      const clientSecret = process.env.GITHUB_CLIENT_SECRET;
      if (!clientId || !clientSecret) {
        // Fallback to simulated flow if no client ID or secret is set
        return res.json({
          success: true,
          simulated: true,
          authUrl: `${backendUrl}/api/auth/github/callback?simulated=true&state=${workspaceId}`
        });
      }
      const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${backendUrl}/api/auth/github/callback&state=${workspaceId}&scope=repo,read:user`;
      return res.json({ success: true, simulated: false, authUrl });
    }

    if (platform === 'gitlab') {
      const clientId = process.env.GITLAB_CLIENT_ID;
      const clientSecret = process.env.GITLAB_CLIENT_SECRET;
      if (!clientId || !clientSecret) {
        // Fallback to simulated flow if no client ID or secret is set
        return res.json({
          success: true,
          simulated: true,
          authUrl: `${backendUrl}/api/auth/gitlab/callback?simulated=true&state=${workspaceId}`
        });
      }
      const authUrl = `https://gitlab.com/oauth/authorize?client_id=${clientId}&redirect_uri=${backendUrl}/api/auth/gitlab/callback&response_type=code&state=${workspaceId}&scope=api+read_user`;
      return res.json({ success: true, simulated: false, authUrl });
    }

    res.status(400).json({ message: 'Invalid integration platform specified' });
  } catch (error) {
    console.error('authorizePlatform error:', error.message);
    res.status(500).json({ message: 'Server error generating auth URL' });
  }
};

// Handle OAuth Callback Redirect from Platform
exports.handleCallback = async (req, res) => {
  const { platform } = req.params;
  const { code, state: workspaceId, simulated } = req.query;

  if (!workspaceId) {
    return res.status(400).send('OAuth state/workspaceId parameter is missing');
  }

  try {
    let userData = {};
    let token = 'simulated_token_xyz';

    if (simulated === 'true' || !code) {
      // Setup mock data for simulation
      if (platform === 'github') {
        userData = {
          username: 'srirangank-mock',
          avatarUrl: 'https://avatars.githubusercontent.com/u/9919?v=4',
          profileUrl: 'https://github.com/srirangank-mock',
        };
      } else {
        userData = {
          username: 'srirangan-gitlab-mock',
          avatarUrl: 'https://assets.gitlab-static.net/uploads/-/system/user/avatar/2939/avatar.png',
          profileUrl: 'https://gitlab.com/srirangan-gitlab-mock',
        };
      }
    } else {
      const backendUrl = process.env.BACKEND_URL || 'http://localhost:5000';

      if (platform === 'github') {
        // Exchange code for token
        const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            client_id: process.env.GITHUB_CLIENT_ID,
            client_secret: process.env.GITHUB_CLIENT_SECRET,
            code,
            redirect_uri: `${backendUrl}/api/auth/github/callback`,
          }),
        });

        const tokenData = await tokenResponse.json();
        if (tokenData.error) {
          throw new Error(tokenData.error_description || tokenData.error);
        }
        token = tokenData.access_token;

        // Fetch User Info
        const userResponse = await fetch('https://api.github.com/user', {
          headers: { 
            Authorization: `Bearer ${token}`,
            'User-Agent': 'DoTheThing-App'
          },
        });
        const userProfile = await userResponse.json();
        userData = {
          username: userProfile.login,
          avatarUrl: userProfile.avatar_url,
          profileUrl: userProfile.html_url,
        };
      } else if (platform === 'gitlab') {
        // Exchange code for token
        const tokenResponse = await fetch('https://gitlab.com/oauth/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            client_id: process.env.GITLAB_CLIENT_ID,
            client_secret: process.env.GITLAB_CLIENT_SECRET,
            code,
            grant_type: 'authorization_code',
            redirect_uri: `${backendUrl}/api/auth/gitlab/callback`,
          }),
        });

        const tokenData = await tokenResponse.json();
        if (tokenData.error) {
          throw new Error(tokenData.error_description || tokenData.error);
        }
        token = tokenData.access_token;

        // Fetch User Info
        const userResponse = await fetch('https://gitlab.com/api/v4/user', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const userProfile = await userResponse.json();
        userData = {
          username: userProfile.username,
          avatarUrl: userProfile.avatar_url,
          profileUrl: userProfile.web_url,
        };
      }
    }

    // Save in Database
    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) {
      return res.status(404).send('Workspace not found during callback processing');
    }

    if (!workspace.integrations) {
      workspace.integrations = {};
    }

    workspace.integrations[platform] = {
      connected: true,
      enabled: true,
      accessToken: token,
      username: userData.username,
      avatarUrl: userData.avatarUrl,
      profileUrl: userData.profileUrl,
      linkedRepos: workspace.integrations[platform]?.linkedRepos || [],
    };

    await workspace.save();

    // Respond with self-closing postMessage bridge scripts
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Authorization Successful</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; text-align: center; padding: 50px; background: #f9fafb; color: #1f2937;">
          <div style="max-width: 400px; margin: 0 auto; background: white; padding: 40px; border-radius: 16px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1);">
            <div style="font-size: 48px; margin-bottom: 20px; color: #10b981;">✓</div>
            <h2 style="margin-bottom: 10px; font-weight: 800;">Connected Successfully!</h2>
            <p style="color: #6b7280; font-size: 14px; margin-bottom: 25px;">You have successfully authorized your workspace. This window will close automatically.</p>
          </div>
          <script>
            setTimeout(() => {
              try {
                if (window.opener) {
                  window.opener.postMessage({ type: 'oauth-success', platform: '${platform}' }, '*');
                }
              } catch (e) {
                console.error("Failed to notify parent window:", e);
              }
              window.close();
            }, 1000);
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('handleCallback error:', error.message);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
        <head><title>Authorization Failed</title></head>
        <body style="font-family: sans-serif; text-align: center; padding: 50px; background: #fef2f2;">
          <h2 style="color: #dc2626;">Authorization Failed</h2>
          <p>\${error.message}</p>
          <button onclick="window.close()" style="padding: 10px 20px; background: #dc2626; color: white; border: none; border-radius: 8px; cursor: pointer;">Close Window</button>
        </body>
      </html>
    `);
  }
};

// Manually trigger Simulated Connection (Frontend fallback)
exports.simulateAuthorize = async (req, res) => {
  try {
    const { workspaceId, platform } = req.params;
    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) {
      return res.status(404).json({ message: 'Workspace not found' });
    }

    if (!workspace.integrations) {
      workspace.integrations = {};
    }

    let mockData = {};
    if (platform === 'github') {
      mockData = {
        connected: true,
        enabled: true,
        accessToken: 'mock_github_token_value',
        username: 'srirangank-mock',
        avatarUrl: 'https://avatars.githubusercontent.com/u/9919?v=4',
        profileUrl: 'https://github.com/srirangank-mock',
        linkedRepos: ['SriranganK/dothething', 'SriranganK/dothething-backend'],
      };
    } else if (platform === 'gitlab') {
      mockData = {
        connected: true,
        enabled: true,
        accessToken: 'mock_gitlab_token_value',
        username: 'srirangan-gitlab-mock',
        avatarUrl: 'https://assets.gitlab-static.net/uploads/-/system/user/avatar/2939/avatar.png',
        profileUrl: 'https://gitlab.com/srirangan-gitlab-mock',
        linkedRepos: ['srirangan/core-api'],
      };
    } else {
      return res.status(400).json({ message: 'Invalid integration platform' });
    }

    workspace.integrations[platform] = mockData;
    await workspace.save();

    res.json({
      success: true,
      message: `\${platform === 'github' ? 'GitHub' : 'GitLab'} simulated integration connected!`,
      integration: {
        connected: mockData.connected,
        enabled: mockData.enabled,
        username: mockData.username,
        avatarUrl: mockData.avatarUrl,
        profileUrl: mockData.profileUrl,
        linkedRepos: mockData.linkedRepos,
      }
    });
  } catch (error) {
    console.error('simulateAuthorize error:', error.message);
    res.status(500).json({ message: 'Server error during simulation' });
  }
};

// Disconnect Platform integration
exports.disconnectPlatform = async (req, res) => {
  try {
    const { workspaceId, platform } = req.params;
    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) {
      return res.status(404).json({ message: 'Workspace not found' });
    }

    if (workspace.integrations && workspace.integrations[platform]) {
      workspace.integrations[platform] = {
        connected: false,
        enabled: false,
        accessToken: '',
        username: '',
        avatarUrl: '',
        profileUrl: '',
        linkedRepos: [],
      };
      await workspace.save();
    }

    res.json({ success: true, message: `Disconnected from \${platform}` });
  } catch (error) {
    console.error('disconnectPlatform error:', error.message);
    res.status(500).json({ message: 'Server error disconnecting integrations' });
  }
};

// Toggle integration Enable/Disable state
exports.toggleIntegration = async (req, res) => {
  try {
    const { workspaceId, platform } = req.params;
    const { enabled } = req.body;

    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) {
      return res.status(404).json({ message: 'Workspace not found' });
    }

    if (workspace.integrations && workspace.integrations[platform]) {
      workspace.integrations[platform].enabled = !!enabled;
      await workspace.save();
      return res.json({
        success: true,
        message: `\${platform === 'github' ? 'GitHub' : 'GitLab'} integration toggled to \${enabled ? 'Enabled' : 'Disabled'}`,
        enabled: workspace.integrations[platform].enabled
      });
    }

    res.status(400).json({ message: 'Integration is not connected yet.' });
  } catch (error) {
    console.error('toggleIntegration error:', error.message);
    res.status(500).json({ message: 'Server error toggling integration' });
  }
};

// Get Repositories for selection
exports.getRepos = async (req, res) => {
  try {
    const { workspaceId, platform } = req.params;
    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) {
      return res.status(404).json({ message: 'Workspace not found' });
    }

    const config = workspace.integrations?.[platform];
    if (!config || !config.connected) {
      return res.status(400).json({ message: 'Integration not connected' });
    }

    const isMock = config.accessToken.includes('mock') || config.accessToken.includes('simulated');
    let repos = [];

    if (isMock) {
      // Return simulated repo choices
      if (platform === 'github') {
        repos = [
          { id: 101, name: 'dothething', fullName: 'SriranganK/dothething', description: 'Real-time multi-tenant tool' },
          { id: 102, name: 'dothething-backend', fullName: 'SriranganK/dothething-backend', description: 'API backend server' },
          { id: 103, name: 'antigravity-ui', fullName: 'SriranganK/antigravity-ui', description: 'Design assets library' },
          { id: 104, name: 'project-core', fullName: 'SriranganK/project-core', description: 'Core scripts' },
          { id: 105, name: 'demo-app', fullName: 'SriranganK/demo-app', description: 'Demo sandbox' },
        ];
      } else {
        repos = [
          { id: 201, name: 'core-api', fullName: 'srirangan/core-api', description: 'Core web API microservice' },
          { id: 202, name: 'analytics-dashboard', fullName: 'srirangan/analytics-dashboard', description: 'Metrics reporter dashboard' },
          { id: 203, name: 'ci-cd-runner', fullName: 'srirangan/ci-cd-runner', description: 'GitLab runner testing project' },
        ];
      }
    } else {
      // Call real API
      if (platform === 'github') {
        const repoResponse = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated', {
          headers: { 
            Authorization: `Bearer ${config.accessToken}`,
            'User-Agent': 'DoTheThing-App'
          },
        });
        if (repoResponse.ok) {
          const list = await repoResponse.json();
          repos = list.map(r => ({
            id: r.id,
            name: r.name,
            fullName: r.full_name,
            description: r.description,
            private: r.private,
            language: r.language,
            updatedAt: r.updated_at,
            createdAt: r.created_at,
          }));
        } else {
          const errorDetails = await repoResponse.text();
          console.error('Failed to retrieve repos from GitHub API. Details:', errorDetails);
          throw new Error(`Failed to retrieve repos from GitHub API: ${errorDetails}`);
        }
      } else if (platform === 'gitlab') {
        const repoResponse = await fetch('https://gitlab.com/api/v4/projects?membership=true&per_page=100&simple=true', {
          headers: { 
            Authorization: `Bearer ${config.accessToken}`,
            'User-Agent': 'DoTheThing-App'
          },
        });
        if (repoResponse.ok) {
          const list = await repoResponse.json();
          repos = list.map(r => ({
            id: r.id,
            name: r.path,
            fullName: r.path_with_namespace,
            description: r.description,
            private: r.visibility === 'private',
            language: r.language || 'Unknown',
            updatedAt: r.last_activity_at || r.updated_at,
            createdAt: r.created_at,
          }));
        } else {
          throw new Error('Failed to retrieve projects from GitLab API');
        }
      }
    }

    res.json({ success: true, repos });
  } catch (error) {
    console.error('getRepos error:', error.message);
    res.status(500).json({ message: 'Failed to retrieve platform repositories' });
  }
};

// Save linked repositories list to Workspace
exports.linkRepos = async (req, res) => {
  try {
    const { workspaceId, platform } = req.params;
    const { repos } = req.body; // Array of repo fullNames e.g. ["owner/repo"]

    if (!Array.isArray(repos)) {
      return res.status(400).json({ message: 'repos must be an array of string identifiers' });
    }

    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) {
      return res.status(404).json({ message: 'Workspace not found' });
    }

    if (workspace.integrations && workspace.integrations[platform]) {
      workspace.integrations[platform].linkedRepos = repos;
      await workspace.save();
      return res.json({
        success: true,
        message: 'Linked repositories updated successfully',
        linkedRepos: workspace.integrations[platform].linkedRepos,
      });
    }

    res.status(400).json({ message: 'Platform integration not active' });
  } catch (error) {
    console.error('linkRepos error:', error.message);
    res.status(500).json({ message: 'Server error saving linked repositories' });
  }
};

// Link an issue/item manually to a repository
exports.linkItemRepo = async (req, res) => {
  try {
    const { itemId } = req.params;
    const { repo } = req.body;

    const item = await Item.findById(itemId);
    if (!item) {
      return res.status(404).json({ message: 'Issue not found' });
    }

    item.linkedRepo = repo || '';
    await item.save();

    res.json({ success: true, message: 'Repository linked to issue successfully', item });
  } catch (error) {
    console.error('linkItemRepo error:', error.message);
    res.status(500).json({ message: 'Server error linking repository to issue' });
  }
};

// Create a branch on GitHub/GitLab directly from the issue
exports.createItemBranch = async (req, res) => {
  try {
    const { itemId } = req.params;
    const { repo, branchName, baseBranch } = req.body;

    if (!repo || !branchName) {
      return res.status(400).json({ message: 'repo and branchName are required' });
    }

    const item = await Item.findById(itemId);
    if (!item) {
      return res.status(404).json({ message: 'Issue not found' });
    }

    const board = await Board.findById(item.board);
    if (!board) {
      return res.status(404).json({ message: 'Board associated with issue not found' });
    }

    const workspace = await Workspace.findById(board.workspace);
    if (!workspace) {
      return res.status(404).json({ message: 'Workspace associated with issue not found' });
    }

    const githubEnabled = workspace.integrations?.github?.connected && workspace.integrations?.github?.enabled;
    const gitlabEnabled = workspace.integrations?.gitlab?.connected && workspace.integrations?.gitlab?.enabled;

    if (!githubEnabled && !gitlabEnabled) {
      return res.status(400).json({ message: 'No integration active' });
    }

    const activePlatform = githubEnabled ? 'github' : 'gitlab';
    const config = workspace.integrations[activePlatform];
    const isMock = config.accessToken.includes('mock') || config.accessToken.includes('simulated');

    if (isMock) {
      // Mock flow: just update database
      if (activePlatform === 'github') {
        item.githubBranchName = branchName;
      } else {
        item.gitlabBranchName = branchName;
      }
      item.linkedRepo = repo;
      await item.save();
      return res.json({ success: true, branchName, simulated: true });
    }

    // Live API call
    const token = config.accessToken;
    const base = baseBranch || 'main';

    if (activePlatform === 'github') {
      // 1. Check/get default branch details if base wasn't specified
      let defaultBranch = base;
      if (!baseBranch) {
        const repoRes = await fetch(`https://api.github.com/repos/${repo}`, {
          headers: { 
            Authorization: `Bearer ${token}`,
            'User-Agent': 'DoTheThing-App'
          }
        });
        if (repoRes.ok) {
          const repoData = await repoRes.json();
          defaultBranch = repoData.default_branch || 'main';
        }
      }

      // 2. Fetch the latest commit SHA of the base branch
      const refRes = await fetch(`https://api.github.com/repos/${repo}/git/ref/heads/${defaultBranch}`, {
        headers: { 
          Authorization: `Bearer ${token}`,
          'User-Agent': 'DoTheThing-App'
        }
      });
      
      if (!refRes.ok) {
        const errText = await refRes.text();
        return res.status(400).json({ message: `Failed to find base branch '${defaultBranch}': ${errText}` });
      }

      const refData = await refRes.json();
      const sha = refData.object.sha;

      // 3. Create the new branch reference
      const createRes = await fetch(`https://api.github.com/repos/${repo}/git/refs`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'DoTheThing-App'
        },
        body: JSON.stringify({
          ref: `refs/heads/${branchName}`,
          sha: sha
        })
      });

      if (!createRes.ok) {
        const errText = await createRes.text();
        return res.status(400).json({ message: `Failed to create branch: ${errText}` });
      }

      // 4. Save to DB
      item.githubBranchName = branchName;
      item.linkedRepo = repo;
      await item.save();
      
      res.json({ success: true, branchName });

    } else if (activePlatform === 'gitlab') {
      const encodedRepo = encodeURIComponent(repo);

      // 1. Create the branch in GitLab
      const createRes = await fetch(`https://gitlab.com/api/v4/projects/${encodedRepo}/repository/branches`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'DoTheThing-App'
        },
        body: JSON.stringify({
          branch: branchName,
          ref: base
        })
      });

      if (!createRes.ok) {
        const errText = await createRes.text();
        return res.status(400).json({ message: `Failed to create branch in GitLab: ${errText}` });
      }

      // 2. Save to DB
      item.gitlabBranchName = branchName;
      item.linkedRepo = repo;
      await item.save();

      res.json({ success: true, branchName });
    }

  } catch (error) {
    console.error('createItemBranch error:', error.message);
    res.status(500).json({ message: 'Server error creating branch' });
  }
};
