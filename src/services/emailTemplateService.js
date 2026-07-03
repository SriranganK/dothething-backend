const LOGO_URL = 'https://plain-apac-prod-public.komododecks.com/202606/30/Oblgl5GYuDfN984XYIln/image.png';

/**
 * Builds the wrapper layout table for the email content.
 */
const buildBaseLayout = ({ subject, headerContext, title, contentHtml, ctaHtml, footerMessage }) => {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; width: 100% !important; background-color: #f4f5f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #172b4d;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f4f5f7; padding: 30px 10px; min-width: 100%;">
    <tr>
      <td align="center" valign="top">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border: 1px solid #dfe1e6; border-radius: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); overflow: hidden; text-align: left;">
          <!-- Top Accent Border -->
          <tr>
            <td height="4" style="background-color: #2563eb; line-height: 4px; font-size: 4px;">&nbsp;</td>
          </tr>
          
          <!-- Header (Logo and Context) -->
          <tr>
            <td style="padding: 24px 24px 12px 24px;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="left" valign="middle">
                    <img src="${LOGO_URL}" alt="doTheThing" style="height: 26px; width: auto; max-height: 26px; display: block; border: 0;" />
                  </td>
                  <td align="right" valign="middle" style="font-size: 11px; color: #5e6c84; font-weight: 600; text-transform: uppercase; letter-spacing: 0.8px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                    ${headerContext || 'doTheThing'}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Content Body -->
          <tr>
            <td style="padding: 12px 24px 28px 24px;">
              <h1 style="font-size: 19px; font-weight: 600; line-height: 1.4; color: #172b4d; margin-top: 0; margin-bottom: 18px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; letter-spacing: -0.01em;">
                ${title}
              </h1>
              
              <div style="font-size: 14px; line-height: 1.5; color: #172b4d; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                ${contentHtml}
              </div>
              
              ${ctaHtml || ''}
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #fafbfc; border-top: 1px solid #dfe1e6; padding: 20px 24px; text-align: center;">
              <p style="font-size: 11px; color: #5e6c84; line-height: 1.6; margin: 0 0 6px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                This email was sent by <strong>doTheThing</strong>.
              </p>
              <p style="font-size: 10px; color: #8993a4; line-height: 1.6; margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                ${footerMessage || 'You are receiving this because of your notification settings. You can update these settings in your user profile.'}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

/**
 * Builds the call-to-action button HTML.
 */
const buildCtaHtml = (text, url) => {
  if (!text || !url) return '';
  return `
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top: 24px; margin-bottom: 8px;">
      <tr>
        <td align="left">
          <table border="0" cellpadding="0" cellspacing="0">
            <tr>
              <td align="center" bgcolor="#2563eb" style="border-radius: 3px;">
                <a href="${url}" target="_blank" style="font-size: 14px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #ffffff; text-decoration: none; border-radius: 3px; padding: 8px 16px; border: 1px solid #2563eb; display: inline-block; font-weight: 600;">
                  ${text}
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `.trim();
};

/**
 * Main Template Selector and Compiler.
 * 
 * @param {string} type - Template category (WELCOME, MENTION, TASK_ASSIGNED, etc.)
 * @param {Object} data - Parameters to merge into the templates
 * @returns {Object} { subject, html, text }
 */
const renderEmail = (type, data = {}) => {
  let subject = '';
  let headerContext = '';
  let title = '';
  let contentHtml = '';
  let ctaHtml = '';
  let text = '';
  let footerMessage = '';

  const recipientName = data.recipientName || 'there';

  switch (type.toUpperCase()) {
    case 'INVITE': {
      const { inviterName, workspaceName, toEmail } = data;
      subject = `Invitation to join ${workspaceName} on doTheThing`;
      headerContext = 'Workspace Invitation';
      title = `You've been invited to join ${workspaceName}`;
      contentHtml = `
        <p style="margin-top: 0; margin-bottom: 14px;">Hi,</p>
        <p style="margin-top: 0; margin-bottom: 14px;"><strong>${inviterName || 'A team member'}</strong> has invited you to join their workspace <strong>"${workspaceName}"</strong> on <strong>doTheThing</strong> tracker app.</p>
        <p style="margin-top: 0; margin-bottom: 14px;">Collaborate on tasks, manage boards, and track milestones with the rest of the team.</p>
        <p style="margin-top: 0; margin-bottom: 0;">If you don't have an account, please sign up using your email: <strong>${toEmail}</strong>.</p>
      `;
      const inviteUrl = `http://localhost:5173/register?email=${encodeURIComponent(toEmail)}`;
      ctaHtml = buildCtaHtml('Join Workspace', inviteUrl);
      text = `Hi,\n\n${inviterName || 'A team member'} has invited you to join their workspace "${workspaceName}" on doTheThing.\n\nJoin the workspace at: ${inviteUrl}\n\nBest regards,\nThe doTheThing Team`;
      break;
    }

    case 'OTP': {
      const { otpCode } = data;
      subject = `Password Reset Verification Code - doTheThing`;
      headerContext = 'Security Verification';
      title = 'Reset Your Password';
      contentHtml = `
        <p style="margin-top: 0; margin-bottom: 14px;">Hello,</p>
        <p style="margin-top: 0; margin-bottom: 20px;">We received a request to reset your password. Use the verification code below to proceed with setting up a new password:</p>
        
        <table border="0" cellpadding="0" cellspacing="0" style="margin: 20px 0;">
          <tr>
            <td style="background-color: #f4f5f7; border: 1.5px dashed #2563eb; padding: 12px 28px; border-radius: 4px;">
              <span style="font-family: 'Courier New', Courier, monospace; font-size: 28px; font-weight: bold; color: #2563eb; letter-spacing: 0.15em;">${otpCode}</span>
            </td>
          </tr>
        </table>
        
        <p style="font-size: 13px; font-weight: 600; color: #de350b; margin-top: 0; margin-bottom: 16px;">This code expires in 5 minutes and is valid for a single use.</p>
        <p style="margin-top: 0; margin-bottom: 0; color: #5e6c84; font-size: 13px;">If you did not request a password reset, you can safely ignore this email. Your password will remain unchanged.</p>
      `;
      text = `Hello,\n\nWe received a request to reset your password. Your password reset verification code is: ${otpCode}\n\nThis code expires in 5 minutes.\n\nIf you did not request this, please ignore this email.`;
      break;
    }

    case 'WELCOME': {
      subject = 'Welcome to doTheThing! 🚀';
      headerContext = 'Welcome';
      title = `Welcome to doTheThing, ${recipientName}!`;
      contentHtml = `
        <p style="margin-top: 0; margin-bottom: 14px;">Thanks for signing up for <strong>doTheThing</strong>. You now have access to a smarter workspace where teams plan, track, and deliver work faster.</p>
        
        <div style="background-color: #fafbfc; border: 1px solid #dfe1e6; border-radius: 4px; padding: 16px; margin: 20px 0;">
          <h3 style="font-size: 13px; font-weight: 600; color: #172b4d; margin-top: 0; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Start in 3 Simple Steps</h3>
          <table border="0" cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td valign="top" style="padding-bottom: 10px; font-size: 13px;">
                <strong>1. Create a Workspace</strong><br/>
                Establish a shared space for your projects and teammates.
              </td>
            </tr>
            <tr>
              <td valign="top" style="padding-bottom: 10px; font-size: 13px;">
                <strong>2. Set Up a Kanban Board</strong><br/>
                Add columns and tasks to visualize your team's workflow.
              </td>
            </tr>
            <tr>
              <td valign="top" style="padding-bottom: 0; font-size: 13px;">
                <strong>3. Invite Teammates</strong><br/>
                Assign cards, add comments, and track progress together.
              </td>
            </tr>
          </table>
        </div>
        
        <p style="margin-top: 0; margin-bottom: 0;">Click below to launch your workspace and get started immediately:</p>
      `;
      ctaHtml = buildCtaHtml('Launch Workspace', 'http://localhost:5173');
      text = `Welcome to doTheThing, ${recipientName}!\n\nOrganize projects, collaborate with your team, and get more done every day.\n\nLaunch your workspace at: http://localhost:5173`;
      break;
    }

    case 'MENTION': {
      const { taskTitle, message, entityId } = data;
      subject = `You were mentioned in a task`;
      headerContext = 'Mention';
      title = `Mention in: ${taskTitle || 'Task'}`;
      
      // Attempt to strip wrapper details if formatted like a JSON string in message
      let cleanComment = message;
      if (message && message.includes('": "')) {
        cleanComment = message.split('": "')[1] || message;
      }

      contentHtml = `
        <p style="margin-top: 0; margin-bottom: 14px;">Hi <strong>${recipientName}</strong>,</p>
        <p style="margin-top: 0; margin-bottom: 14px;">A teammate mentioned you in a task comment:</p>
        
        <div style="background-color: #fafbfc; border-left: 3px solid #2563eb; padding: 12px 16px; margin: 16px 0; border-radius: 0 4px 4px 0; font-style: italic; color: #253858; font-size: 14px; line-height: 1.5;">
          "${cleanComment}"
        </div>
      `;
      if (entityId) {
        ctaHtml = buildCtaHtml('Open Task Details', `http://localhost:5173/item/${entityId}`);
      }
      text = `Hi ${recipientName},\n\nYou were mentioned in a comment:\n"${cleanComment}"\n\nView details: http://localhost:5173/item/${entityId}`;
      break;
    }

    case 'TASK_ASSIGNED': {
      const { taskTitle, dueDate, description, entityId } = data;
      subject = `New task assigned to you: ${taskTitle}`;
      headerContext = 'Assignment';
      title = 'Task Assigned To You';
      
      const formattedDate = dueDate ? new Date(dueDate).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }) : 'None';
      
      contentHtml = `
        <p style="margin-top: 0; margin-bottom: 14px;">Hi <strong>${recipientName}</strong>,</p>
        <p style="margin-top: 0; margin-bottom: 18px;">You have been assigned a new task: <strong>"${taskTitle}"</strong>.</p>
        
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse; margin-bottom: 20px; font-size: 13px;">
          <tr style="border-bottom: 1px solid #f4f5f7;">
            <td valign="top" style="padding: 8px 0; font-weight: 600; color: #5e6c84; width: 100px;">Due Date</td>
            <td valign="top" style="padding: 8px 0; color: #172b4d;">${formattedDate}</td>
          </tr>
          <tr>
            <td valign="top" style="padding: 8px 0; font-weight: 600; color: #5e6c84;">Description</td>
            <td valign="top" style="padding: 8px 0; color: #172b4d; line-height: 1.5;">${description || 'No description provided.'}</td>
          </tr>
        </table>
      `;
      if (entityId) {
        ctaHtml = buildCtaHtml('Open Task Details', `http://localhost:5173/item/${entityId}`);
      }
      text = `Hi ${recipientName},\n\nYou have been assigned the task: "${taskTitle}"\nDue date: ${formattedDate}\n\nView task: http://localhost:5173/item/${entityId}`;
      break;
    }

    case 'DEADLINE_REMINDER': {
      const { taskTitle, dueDate, message, entityId } = data;
      const isOverdue = message && message.toLowerCase().includes('overdue');
      subject = isOverdue ? `Overdue Task Alert: ${taskTitle}` : `Task Due Soon: ${taskTitle}`;
      headerContext = 'Reminder';
      title = isOverdue ? 'Task is Overdue! ⚠️' : 'Task Due Soon ⏰';
      
      const formattedDate = dueDate ? new Date(dueDate).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A';
      
      contentHtml = `
        <p style="margin-top: 0; margin-bottom: 14px;">Hi <strong>${recipientName}</strong>,</p>
        <p style="margin-top: 0; margin-bottom: 16px;">This is a deadline reminder for one of your assigned tasks:</p>
        
        <div style="background-color: ${isOverdue ? '#ffebe6' : '#fff0f0'}; border-left: 3px solid #de350b; padding: 14px; border-radius: 0 4px 4px 0; margin: 16px 0;">
          <h4 style="margin: 0 0 4px 0; color: #de350b; font-size: 14px; font-weight: 600;">${taskTitle}</h4>
          <p style="margin: 0 0 6px 0; font-size: 13px;">Due Date: <strong>${formattedDate}</strong></p>
          <p style="margin: 0; font-size: 13px; font-weight: 600; color: #de350b;">${message}</p>
        </div>
      `;
      if (entityId) {
        ctaHtml = buildCtaHtml(isOverdue ? 'View Overdue Task' : 'View Task Details', `http://localhost:5173/item/${entityId}`);
      }
      text = `Hi ${recipientName},\n\nDeadline reminder for: "${taskTitle}"\nDue Date: ${formattedDate}\nDetails: ${message}\n\nView details: http://localhost:5173/item/${entityId}`;
      break;
    }

    case 'TEAM_ANNOUNCEMENT': {
      const { title: annTitle, message } = data;
      subject = `New Team Announcement: ${annTitle}`;
      headerContext = 'Announcement';
      title = annTitle || 'New Team Announcement';
      contentHtml = `
        <p style="margin-top: 0; margin-bottom: 14px;">Hi <strong>${recipientName}</strong>,</p>
        <p style="margin-top: 0; margin-bottom: 16px;">A new announcement was posted in your workspace:</p>
        
        <div style="background-color: #eff6ff; border-left: 3px solid #2563eb; padding: 16px; border-radius: 0 4px 4px 0; margin: 16px 0; color: #1e40af; line-height: 1.5;">
          ${message}
        </div>
      `;
      ctaHtml = buildCtaHtml('Open Workspace', 'http://localhost:5173');
      text = `Hi ${recipientName},\n\nA new announcement was posted: "${annTitle}"\n\n"${message}"\n\nOpen Workspace: http://localhost:5173`;
      break;
    }

    case 'WEEKLY_SUMMARY': {
      const { assignedCount, completedCount, pendingCount } = data;
      subject = 'Your Weekly doTheThing Summary 📊';
      headerContext = 'Activity Summary';
      title = 'Weekly Workload Summary';
      contentHtml = `
        <p style="margin-top: 0; margin-bottom: 14px;">Hi <strong>${recipientName}</strong>,</p>
        <p style="margin-top: 0; margin-bottom: 20px;">Here is your weekly workload summary across all active workspace projects:</p>
        
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 24px;">
          <tr>
            <td width="30%" align="center" style="background-color: #eff6ff; border: 1.5px solid #bfdbfe; border-radius: 4px; padding: 14px 10px;">
              <span style="font-size: 24px; font-weight: 800; color: #1e40af; display: block; margin-bottom: 2px;">${assignedCount}</span>
              <span style="font-size: 10px; font-weight: bold; color: #1e40af; text-transform: uppercase; letter-spacing: 0.5px;">Total Assigned</span>
            </td>
            <td width="5%">&nbsp;</td>
            <td width="30%" align="center" style="background-color: #ecfdf5; border: 1.5px solid #a7f3d0; border-radius: 4px; padding: 14px 10px;">
              <span style="font-size: 24px; font-weight: 800; color: #065f46; display: block; margin-bottom: 2px;">${completedCount}</span>
              <span style="font-size: 10px; font-weight: bold; color: #065f46; text-transform: uppercase; letter-spacing: 0.5px;">Completed</span>
            </td>
            <td width="5%">&nbsp;</td>
            <td width="30%" align="center" style="background-color: #fef2f2; border: 1.5px solid #fecaca; border-radius: 4px; padding: 14px 10px;">
              <span style="font-size: 24px; font-weight: 800; color: #991b1b; display: block; margin-bottom: 2px;">${pendingCount}</span>
              <span style="font-size: 10px; font-weight: bold; color: #991b1b; text-transform: uppercase; letter-spacing: 0.5px;">Pending</span>
            </td>
          </tr>
        </table>
        
        <p style="margin-top: 0; margin-bottom: 0;">Keep up the great work! Adjust your task timelines or collaborate with teammates to clear pending items.</p>
      `;
      ctaHtml = buildCtaHtml('Open Workspace', 'http://localhost:5173');
      text = `Hi ${recipientName},\n\nHere is your weekly doTheThing summary:\n- Total Assigned: ${assignedCount}\n- Completed: ${completedCount}\n- Pending: ${pendingCount}\n\nOpen Workspace: http://localhost:5173`;
      break;
    }

    case 'MILESTONE_ALERT': {
      const { title: mTitle, message } = data;
      subject = mTitle || 'Milestone Update';
      headerContext = 'Milestone Alert';
      title = mTitle || 'Milestone Update';
      contentHtml = `
        <p style="margin-top: 0; margin-bottom: 14px;">Hi <strong>${recipientName}</strong>,</p>
        <p style="margin-top: 0; margin-bottom: 16px;">An update has occurred regarding milestones in your workspace:</p>
        
        <div style="background-color: #fafbfc; border-left: 3px solid #2563eb; padding: 12px 16px; margin: 16px 0; border-radius: 0 4px 4px 0; color: #172b4d; font-size: 14px; line-height: 1.5;">
          ${message}
        </div>
      `;
      ctaHtml = buildCtaHtml('View Workspace', 'http://localhost:5173');
      text = `Hi ${recipientName},\n\nMilestone Alert: ${mTitle}\n\n${message}\n\nView Workspace: http://localhost:5173`;
      break;
    }

    case 'EXPENSE_INVITE': {
      const { inviterName, boardName, boardType, toEmail } = data;
      subject = `Invitation to join Board "${boardName}" on doTheThing`;
      headerContext = 'Board Invitation';
      title = `${inviterName || 'A team member'} has invited you to a board`;
      contentHtml = `
        <p style="margin-top: 0; margin-bottom: 14px;">Hi,</p>
        <p style="margin-top: 0; margin-bottom: 20px;"><strong>${inviterName || 'A colleague'}</strong> has invited you to join the Expense Calculator Board <strong>"${boardName}"</strong> on <strong>doTheThing</strong>.</p>
        
        <!-- Board Details Box -->
        <div style="background-color: #fafbfc; border: 1px solid #dfe1e6; border-radius: 6px; padding: 20px; margin: 24px 0;">
          <table border="0" cellpadding="0" cellspacing="0" width="100%" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px; line-height: 1.5; color: #172b4d;">
            <tr>
              <td colspan="2" style="padding-bottom: 12px; font-size: 11px; font-weight: 700; color: #5e6c84; text-transform: uppercase; letter-spacing: 0.8px;">
                BOARD DETAILS
              </td>
            </tr>
            <tr style="border-top: 1px solid #ebecf0;">
              <td style="padding: 10px 0; color: #5e6c84; font-weight: 500; width: 120px;">Board Name</td>
              <td style="padding: 10px 0; font-weight: 600; color: #2563eb;">${boardName}</td>
            </tr>
            <tr style="border-top: 1px solid #ebecf0;">
              <td style="padding: 10px 0; color: #5e6c84; font-weight: 500;">Invited By</td>
              <td style="padding: 10px 0; color: #172b4d;">${inviterName}</td>
            </tr>
            <tr style="border-top: 1px solid #ebecf0;">
              <td style="padding: 10px 0; color: #5e6c84; font-weight: 500;">Board Type</td>
              <td style="padding: 10px 0; color: #172b4d; text-transform: capitalize;">${boardType || 'monthly'} Expense Tracker</td>
            </tr>
          </table>
        </div>

        <!-- What you can do -->
        <p style="margin-top: 0; margin-bottom: 12px; font-size: 13px; font-weight: 600; color: #5e6c84; text-transform: uppercase; letter-spacing: 0.5px;">
          What you can do with this board:
        </p>
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px; line-height: 1.4; color: #172b4d; margin-bottom: 24px;">
          <tr>
            <td valign="top" style="padding: 6px 0; width: 24px; color: #2563eb; font-size: 14px;">⚡</td>
            <td valign="top" style="padding: 6px 0;"><strong>Track Expenses:</strong> Easily log shared costs (meals, transport, software, bills) with your team or group.</td>
          </tr>
          <tr>
            <td valign="top" style="padding: 6px 0; width: 24px; color: #2563eb; font-size: 14px;">📊</td>
            <td valign="top" style="padding: 6px 0;"><strong>View Balances:</strong> Keep track of who owes who, settle balances, and monitor splits in real-time.</td>
          </tr>
          <tr>
            <td valign="top" style="padding: 6px 0; width: 24px; color: #2563eb; font-size: 14px;">🤝</td>
            <td valign="top" style="padding: 6px 0;"><strong>Collaborate Instantly:</strong> Sync transactions in real-time across all active board members.</td>
          </tr>
        </table>

        <p style="margin-top: 0; margin-bottom: 0; color: #5e6c84;">
          Please log in to your account using your email address <strong>${toEmail}</strong> to accept the invite.
        </p>
      `;
      const inviteUrl = `http://localhost:5173/?tab=expense-calculator`;
      ctaHtml = buildCtaHtml('Accept Invitation', inviteUrl);
      text = `Hi,\n\n${inviterName} has invited you to join the Expense Calculator Board "${boardName}" (${boardType || 'monthly'}).\n\nAccept the invitation at: ${inviteUrl}\n\nBest,\nThe doTheThing Team`;
      break;
    }

    default: {
      const { title: dTitle, message } = data;
      subject = dTitle || 'doTheThing Update';
      headerContext = 'Notification';
      title = dTitle || 'Workspace Update';
      contentHtml = `
        <p style="margin-top: 0; margin-bottom: 14px;">Hi <strong>${recipientName}</strong>,</p>
        <p style="margin-top: 0; margin-bottom: 16px;">${message || 'You have a new update in your doTheThing account.'}</p>
      `;
      ctaHtml = buildCtaHtml('View App', 'http://localhost:5173');
      text = `Hi ${recipientName},\n\nUpdate: ${dTitle}\n\n${message}\n\nView details: http://localhost:5173`;
      break;
    }
  }

  const html = buildBaseLayout({
    subject,
    headerContext,
    title,
    contentHtml,
    ctaHtml,
    footerMessage
  });

  return { subject, html, text };
};

module.exports = {
  renderEmail
};
