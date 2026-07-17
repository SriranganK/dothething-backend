const Item = require('../models/Item');
const Board = require('../models/Board');
const Workspace = require('../models/Workspace');

// Get linked branches, commits, PRs, workflows, and deployment status for an issue
exports.getItemDevelopment = async (req, res) => {
  try {
    const { itemId } = req.params;

    // 1. Fetch Item
    const item = await Item.findById(itemId);
    if (!item) {
      return res.status(404).json({ message: 'Issue not found' });
    }

    // 2. Fetch Board and Workspace to verify integration connection
    const board = await Board.findById(item.board);
    if (!board) {
      return res.status(404).json({ message: 'Board associated with issue not found' });
    }

    const workspace = await Workspace.findById(board.workspace);
    if (!workspace) {
      return res.status(404).json({ message: 'Workspace associated with issue not found' });
    }

    // Check if any integrations are connected and enabled
    const githubEnabled = workspace.integrations?.github?.connected && workspace.integrations?.github?.enabled;
    const gitlabEnabled = workspace.integrations?.gitlab?.connected && workspace.integrations?.gitlab?.enabled;

    if (!githubEnabled && !gitlabEnabled) {
      return res.json({
        success: true,
        integrationsActive: false,
        message: 'No development integration active for this workspace.'
      });
    }

    const activePlatform = githubEnabled ? 'github' : 'gitlab';
    const integrationConfig = workspace.integrations[activePlatform];
    const linkedRepos = integrationConfig.linkedRepos || [];
    const reposToQuery = [...linkedRepos];
    if (item.linkedRepo && !reposToQuery.includes(item.linkedRepo)) {
      reposToQuery.push(item.linkedRepo);
    }

    // If no repos are linked, return empty lists
    if (reposToQuery.length === 0) {
      return res.json({
        success: true,
        integrationsActive: true,
        platform: activePlatform,
        reposLinked: 0,
        development: { branches: [], commits: [], pullRequests: [], workflows: [], deployments: [] }
      });
    }

    const itemKey = `${item.type.toUpperCase()}-${itemId.slice(-5).toUpperCase()}`;
    const isMock = integrationConfig.accessToken.includes('mock') || integrationConfig.accessToken.includes('simulated');

    if (isMock) {
      // Return dynamic mock data if using simulated tokens
      return res.json({
        success: true,
        integrationsActive: true,
        platform: activePlatform,
        reposLinked: reposToQuery.length,
        linkedRepos: reposToQuery,
        development: generateMockData(item, itemKey, integrationConfig, reposToQuery[0], activePlatform)
      });
    }

    // Initialize lists
    const branches = [];
    const commits = [];
    const pullRequests = [];
    const workflows = [];
    const deployments = [];

    // Query Real APIs
    if (activePlatform === 'github') {
      const token = integrationConfig.accessToken;
      
      for (const repo of reposToQuery) {
        try {
          // A. Fetch branches and filter by issue key or manual branch
          const branchesRes = await fetch(`https://api.github.com/repos/${repo}/branches?per_page=100`, {
            headers: { 
              Authorization: `Bearer ${token}`,
              Accept: 'application/vnd.github+json',
              'User-Agent': 'DoTheThing-App'
            }
          });
          if (branchesRes.ok) {
            const list = await branchesRes.json();
            const manuallyLinkedBranch = item.githubBranchName;
            const matched = list.filter(b => b.name.toLowerCase().includes(itemKey.toLowerCase()) || (manuallyLinkedBranch && b.name === manuallyLinkedBranch));
            for (const b of matched) {
              branches.push({
                name: b.name,
                repository: repo,
                lastCommit: 'Active',
                status: 'Active',
                url: `https://github.com/${repo}/tree/${b.name}`
              });

              // Fetch latest run for this branch
              const runsRes = await fetch(`https://api.github.com/repos/${repo}/actions/runs?branch=${encodeURIComponent(b.name)}&per_page=1`, {
                headers: { 
                  Authorization: `Bearer ${token}`,
                  Accept: 'application/vnd.github+json',
                  'User-Agent': 'DoTheThing-App'
                }
              });
              if (runsRes.ok) {
                const runData = await runsRes.json();
                if (runData.workflow_runs && runData.workflow_runs.length > 0) {
                  const run = runData.workflow_runs[0];
                  workflows.push({
                    name: run.name || 'CI Build',
                    status: run.conclusion === 'success' ? 'passed' : run.status === 'completed' ? 'failed' : 'running',
                    trigger: `${run.event} on branch: ${b.name}`,
                    duration: run.run_started_at ? `${Math.round((new Date(run.updated_at) - new Date(run.run_started_at)) / 1000)}s` : '0s',
                    finishedAt: run.updated_at,
                    url: run.html_url
                  });
                }
              }
            }
          }

          // B. Search commits matching issue key
          // Querying search commits endpoint
          const commitSearchRes = await fetch(`https://api.github.com/search/commits?q=repo:${repo}+${itemKey}`, {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/vnd.github.cloak-preview+json',
              'User-Agent': 'DoTheThing-App'
            }
          });
          if (commitSearchRes.ok) {
            const commitData = await commitSearchRes.json();
            if (commitData.items) {
              commitData.items.forEach(c => {
                commits.push({
                  sha: c.sha.slice(0, 8),
                  message: c.commit.message.split('\n')[0],
                  author: c.commit.author.name || c.author?.login || 'developer',
                  date: c.commit.author.date,
                  url: c.html_url
                });
              });
            }
          }

          // C. Search pull requests matching issue key
          const prSearchRes = await fetch(`https://api.github.com/search/issues?q=repo:${repo}+type:pr+${itemKey}`, {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/vnd.github+json',
              'User-Agent': 'DoTheThing-App'
            }
          });
          if (prSearchRes.ok) {
            const prData = await prSearchRes.json();
            if (prData.items) {
              prData.items.forEach(pr => {
                pullRequests.push({
                  id: `#${pr.number}`,
                  title: pr.title,
                  author: pr.user.login,
                  status: pr.state === 'open' ? 'Open' : pr.pull_request?.merged_at ? 'Merged' : 'Closed',
                  reviewStatus: pr.draft ? 'Draft' : 'Open',
                  repository: repo,
                  url: pr.html_url
                });
              });
            }
          }

          // D. Fetch Deployments
          const deployRes = await fetch(`https://api.github.com/repos/${repo}/deployments?per_page=5`, {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/vnd.github+json',
              'User-Agent': 'DoTheThing-App'
            }
          });
          if (deployRes.ok) {
            const deploys = await deployRes.json();
            for (const d of deploys) {
              // Fetch deployment status
              const statusRes = await fetch(`https://api.github.com/repos/${repo}/deployments/${d.id}/statuses?per_page=1`, {
                headers: {
                  Authorization: `Bearer ${token}`,
                  Accept: 'application/vnd.github+json',
                  'User-Agent': 'DoTheThing-App'
                }
              });
              let state = 'Pending';
              if (statusRes.ok) {
                const statuses = await statusRes.json();
                if (statuses.length > 0) {
                  state = statuses[0].state;
                }
              }
              deployments.push({
                environment: d.environment,
                status: state.charAt(0).toUpperCase() + state.slice(1),
                deployedAt: d.created_at,
                url: d.payload?.web_url || ''
              });
            }
          }
        } catch (err) {
          console.error(`Failed to fetch GitHub API data for repo ${repo}:`, err.message);
        }
      }
    } else if (activePlatform === 'gitlab') {
      const token = integrationConfig.accessToken;

      for (const repo of linkedRepos) {
        try {
          const encodedRepo = encodeURIComponent(repo);

          // A. Fetch branches matching issue key
          const branchRes = await fetch(`https://gitlab.com/api/v4/projects/${encodedRepo}/repository/branches?search=${encodeURIComponent(itemKey)}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (branchRes.ok) {
            const list = await branchRes.json();
            for (const b of list) {
              branches.push({
                name: b.name,
                repository: repo,
                lastCommit: 'Active',
                status: 'Active',
                url: b.web_url
              });

              // Fetch latest pipelines for branch
              const pipesRes = await fetch(`https://gitlab.com/api/v4/projects/${encodedRepo}/pipelines?ref=${encodeURIComponent(b.name)}&per_page=1`, {
                headers: { Authorization: `Bearer ${token}` }
              });
              if (pipesRes.ok) {
                const pipes = await pipesRes.json();
                if (pipes.length > 0) {
                  const pipe = pipes[0];
                  workflows.push({
                    name: 'GitLab Pipeline',
                    status: pipe.status === 'success' ? 'passed' : pipe.status === 'running' ? 'running' : 'failed',
                    trigger: `Pipeline run on branch: ${b.name}`,
                    duration: pipe.duration ? `${pipe.duration}s` : '0s',
                    finishedAt: pipe.updated_at,
                    url: pipe.web_url || `https://gitlab.com/${repo}/-/pipelines/${pipe.id}`
                  });
                }
              }
            }
          }

          // B. Fetch commits and filter by issue key
          const commitsRes = await fetch(`https://gitlab.com/api/v4/projects/${encodedRepo}/repository/commits?per_page=100`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (commitsRes.ok) {
            const list = await commitsRes.json();
            list.filter(c => c.message.toLowerCase().includes(itemKey.toLowerCase())).forEach(c => {
              commits.push({
                sha: c.id.slice(0, 8),
                message: c.title,
                author: c.author_name,
                date: c.created_at,
                url: `https://gitlab.com/${repo}/-/commit/${c.id}`
              });
            });
          }

          // C. Fetch Merge Requests matching issue key
          const mrRes = await fetch(`https://gitlab.com/api/v4/projects/${encodedRepo}/merge_requests?search=${encodeURIComponent(itemKey)}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (mrRes.ok) {
            const list = await mrRes.json();
            list.forEach(mr => {
              pullRequests.push({
                id: `!${mr.iid}`,
                title: mr.title,
                author: mr.author?.username || 'developer',
                status: mr.state === 'opened' ? 'Open' : mr.state === 'merged' ? 'Merged' : 'Closed',
                reviewStatus: mr.detailed_merge_status || 'Open',
                repository: repo,
                url: mr.web_url
              });
            });
          }

          // D. Fetch Deployments
          const deployRes = await fetch(`https://gitlab.com/api/v4/projects/${encodedRepo}/deployments?per_page=5`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (deployRes.ok) {
            const list = await deployRes.json();
            list.forEach(d => {
              deployments.push({
                environment: d.environment?.name || 'Production',
                status: d.status ? d.status.charAt(0).toUpperCase() + d.status.slice(1) : 'Successful',
                deployedAt: d.created_at,
                url: d.environment?.external_url || ''
              });
            });
          }
        } catch (err) {
          console.error(`Failed to fetch GitLab API data for repo ${repo}:`, err.message);
        }
      }
    }

    res.json({
      success: true,
      integrationsActive: true,
      platform: activePlatform,
      reposLinked: linkedRepos.length,
      linkedRepos,
      development: { branches, commits, pullRequests, workflows, deployments }
    });
  } catch (error) {
    console.error('getItemDevelopment error:', error.message);
    res.status(500).json({ message: 'Server error retrieving issue development info' });
  }
};

// Mock data generator for simulated flows
function generateMockData(item, itemKey, integrationConfig, repoName, activePlatform) {
  const slugifiedTitle = item.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  return {
    branches: [
      {
        name: `feature/${item.type.toLowerCase()}-${itemKey}-${slugifiedTitle}`,
        repository: repoName,
        lastCommit: '2 hours ago',
        status: 'Active',
        url: activePlatform === 'github' 
          ? `https://github.com/${repoName}/tree/feature/${item.type.toLowerCase()}-${itemKey}-${slugifiedTitle}`
          : `https://gitlab.com/${repoName}/-/tree/feature/${item.type.toLowerCase()}-${itemKey}-${slugifiedTitle}`
      }
    ],
    commits: [
      {
        sha: '8f3a9b1c',
        message: `feat(${item.type.toLowerCase()}): ${itemKey} ${item.title}`,
        author: item.assignee || integrationConfig.username || 'developer',
        date: '2 hours ago',
        url: activePlatform === 'github'
          ? `https://github.com/${repoName}/commit/8f3a9b1c2d3e4f5a6b7c8d9e0f`
          : `https://gitlab.com/${repoName}/-/commit/8f3a9b1c2d3e4f5a6b7c8d9e0f`
      },
      {
        sha: '4d6e8f2a',
        message: `test: add unit test coverage for ${itemKey}`,
        author: item.assignee || integrationConfig.username || 'developer',
        date: '4 hours ago',
        url: activePlatform === 'github'
          ? `https://github.com/${repoName}/commit/4d6e8f2a1b3c5d7e9f`
          : `https://gitlab.com/${repoName}/-/commit/4d6e8f2a1b3c5d7e9f`
      }
    ],
    pullRequests: [
      {
        id: '#42',
        title: `Merge: feat(${item.type.toLowerCase()}): ${itemKey} ${item.title}`,
        author: item.assignee || integrationConfig.username || 'developer',
        status: 'Open',
        reviewStatus: 'Approved',
        repository: repoName,
        url: activePlatform === 'github'
          ? `https://github.com/${repoName}/pull/42`
          : `https://gitlab.com/${repoName}/-/merge_requests/42`
      }
    ],
    workflows: [
      {
        name: 'Build and Verify Test Suite',
        status: 'passed',
        trigger: `Push on branch: feature/${item.type.toLowerCase()}-${itemKey}-${slugifiedTitle}`,
        duration: '3m 45s',
        finishedAt: '2 hours ago',
        url: activePlatform === 'github'
          ? `https://github.com/${repoName}/actions/runs/123456`
          : `https://gitlab.com/${repoName}/-/pipelines/123456`
      }
    ],
    deployments: [
      {
        environment: 'Staging',
        status: 'Successful',
        deployedAt: '1 hour ago',
        url: `https://staging-dothething-${slugifiedTitle}.vercel.app`
      },
      {
        environment: 'Production',
        status: 'Pending Approval',
        deployedAt: 'Waiting for release manager',
        url: `https://production-dothething-${slugifiedTitle}.vercel.app`
      }
    ]
  };
}
