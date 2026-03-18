const { PrismaClient } = require('@prisma/client')
 
const bcrypt = require('bcryptjs')

const prisma = new PrismaClient()

async function seed() {
  console.log('🌱 Starting database seed...')

  try {
    const adminPassword = await bcrypt.hash('admin123', 12)
    const userPassword = await bcrypt.hash('user123', 12)

    const adminUser = await prisma.user.upsert({
      where: { email: 'admin@starboard.com' },
      update: {},
      create: {
        email: 'admin@starboard.com',
        password: adminPassword,
        firstName: 'Admin',
        lastName: 'User',
        isActive: true,
        isEmailVerified: true,
        emailVerifiedAt: new Date(),
        isOnboardingCompleted: true,
        onboardingCompletedAt: new Date(),
      },
    })

    const regularUser = await prisma.user.upsert({
      where: { email: 'user@starboard.com' },
      update: {},
      create: {
        email: 'user@starboard.com',
        password: userPassword,
        firstName: 'John',
        lastName: 'Doe',
        isActive: true,
        isEmailVerified: true,
        emailVerifiedAt: new Date(),
        isOnboardingCompleted: true,
        onboardingCompletedAt: new Date(),
      },
    })

    const startupUser = await prisma.user.upsert({
      where: { email: 'startup@example.com' },
      update: {},
      create: {
        email: 'startup@example.com',
        password: userPassword,
        firstName: 'Jane',
        lastName: 'Smith',
        isActive: true,
        isEmailVerified: true,
        emailVerifiedAt: new Date(),
        isOnboardingCompleted: true,
        onboardingCompletedAt: new Date(),
      },
    })

    console.log('✅ Users created')

    // Create demo workspace
    const workspace = await prisma.workspace.upsert({
      where: { slug: 'demo-accelerator' },
      update: {},
      create: {
        name: 'Demo Accelerator',
        slug: 'demo-accelerator',
        description: 'A demonstration accelerator program for testing Starboard features',
        creatorId: adminUser.id,
        settings: JSON.stringify({
          theme: 'default',
          allowPublicApplications: true,
          maxApplicationsPerUser: 3,
        }),
      },
    })

    console.log('✅ Workspace created')

    // Create roles
    const adminRole = await prisma.role.upsert({
      where: {
        workspaceId_name: {
          workspaceId: workspace.id,
          name: 'Admin',
        },
      },
      update: {},
      create: {
        workspaceId: workspace.id,
        name: 'Admin',
        description: 'Full administrative access',
        isSystem: true,
        permissions: JSON.stringify([
          'workspace.manage',
          'users.manage',
          'applications.manage',
          'events.manage',
          'resources.manage',
          'messages.manage',
        ]),
        canMentor: true,
        canBeMentee: false,
      },
    })

    const memberRole = await prisma.role.upsert({
      where: {
        workspaceId_name: {
          workspaceId: workspace.id,
          name: 'Member',
        },
      },
      update: {},
      create: {
        workspaceId: workspace.id,
        name: 'Member',
        description: 'Basic member access',
        isSystem: true,
        permissions: JSON.stringify([
          'applications.view',
          'applications.submit',
          'events.view',
          'events.register',
          'resources.view',
          'messages.send',
        ]),
        canMentor: false,
        canBeMentee: true,
      },
    })

    const startupRole = await prisma.role.upsert({
      where: {
        workspaceId_name: {
          workspaceId: workspace.id,
          name: 'Startup',
        },
      },
      update: {},
      create: {
        workspaceId: workspace.id,
        name: 'Startup',
        description: 'Startup participant role',
        isSystem: false,
        permissions: JSON.stringify([
          'applications.submit',
          'events.view',
          'events.register',
          'resources.view',
          'messages.send',
        ]),
        canMentor: false,
        canBeMentee: true,
      },
    })

    console.log('✅ Roles created')

    // Create workspace members
    await prisma.workspaceMember.upsert({
      where: {
        workspaceId_userId: {
          workspaceId: workspace.id,
          userId: adminUser.id,
        },
      },
      update: {},
      create: {
        workspaceId: workspace.id,
        userId: adminUser.id,
        roleId: adminRole.id,
      },
    })

    await prisma.workspaceMember.upsert({
      where: {
        workspaceId_userId: {
          workspaceId: workspace.id,
          userId: regularUser.id,
        },
      },
      update: {},
      create: {
        workspaceId: workspace.id,
        userId: regularUser.id,
        roleId: memberRole.id,
      },
    })

    await prisma.workspaceMember.upsert({
      where: {
        workspaceId_userId: {
          workspaceId: workspace.id,
          userId: startupUser.id,
        },
      },
      update: {},
      create: {
        workspaceId: workspace.id,
        userId: startupUser.id,
        roleId: startupRole.id,
      },
    })

    console.log('✅ Workspace members created')

    // Create sample application
    const application = await prisma.application.upsert({
      where: {
        id: 'sample-application-id',
      },
      update: {},
      create: {
        id: 'sample-application-id',
        workspaceId: workspace.id,
        title: 'Summer 2024 Accelerator Program',
        description: 'A 12-week intensive program for early-stage startups',
        isPublic: true,
        isActive: true,
        openDate: new Date(),
        closeDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
        maxSubmissions: 50,
        allowMultipleSubmissions: false,
        requireAuthentication: false,
        reviewerInstructions: 'Please review applications based on team strength, market opportunity, and traction.',
        scoringCriteria: JSON.stringify({
          team: { weight: 30, description: 'Team experience and skills' },
          market: { weight: 25, description: 'Market size and opportunity' },
          traction: { weight: 25, description: 'Current traction and growth' },
          innovation: { weight: 20, description: 'Innovation and uniqueness' }
        }),
        submissionCount: 0,
        createdBy: adminUser.id,
      },
    })

    // Create application fields
    const fieldData = [
      {
        applicationId: application.id,
        type: 'TEXT',
        label: 'Company Name',
        required: true,
        placeholder: 'Enter your company name',
        order: 1,
      },
      {
        applicationId: application.id,
        type: 'TEXTAREA',
        label: 'Company Description',
        required: true,
        placeholder: 'Describe your company and what you do',
        order: 2,
        maxLength: 1000,
      },
      {
        applicationId: application.id,
        type: 'SELECT',
        label: 'Team Size',
        required: true,
        order: 3,
        options: JSON.stringify(['1-2', '3-5', '6-10', '10+']),
      },
      {
        applicationId: application.id,
        type: 'SELECT',
        label: 'Funding Stage',
        required: true,
        order: 4,
        options: JSON.stringify(['Pre-seed', 'Seed', 'Series A', 'Series B+']),
      },
      {
        applicationId: application.id,
        type: 'FILE_UPLOAD',
        label: 'Pitch Deck',
        required: false,
        order: 5,
        allowedFileTypes: JSON.stringify(['.pdf', '.ppt', '.pptx']),
        maxFileSize: 10485760, // 10MB
        maxFiles: 1,
      },
    ]

    for (const field of fieldData) {
      await prisma.applicationField.create({
        data: field,
      })
    }

    console.log('✅ Sample application and fields created')

    // Create sample application submissions (external applicants)
    await prisma.applicationSubmission.create({
      data: {
        applicationId: application.id,
        applicantEmail: 'founder@techstartup.com',
        applicantFirstName: 'Sarah',
        applicantLastName: 'Johnson',
        applicantPhone: '+1-555-0123',
        companyName: 'TechFlow AI',
        status: 'SUBMITTED',
        submittedAt: new Date(),
        responses: {
          company_name: 'TechFlow AI',
          description: 'AI-powered workflow automation for small businesses',
          team_size: '3-5',
          funding_stage: 'Pre-seed',
        },
        progress: 100,
      },
    })

    await prisma.applicationSubmission.create({
      data: {
        applicationId: application.id,
        applicantEmail: 'ceo@greenenergy.co',
        applicantFirstName: 'Mike',
        applicantLastName: 'Chen',
        applicantPhone: '+1-555-0456',
        companyName: 'GreenFlow Energy',
        status: 'UNDER_REVIEW',
        submittedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 1 week ago
        reviewedBy: adminUser.id,
        reviewedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
        score: 8.5,
        responses: {
          company_name: 'GreenFlow Energy',
          description: 'Sustainable energy solutions for urban development',
          team_size: '6-10',
          funding_stage: 'Seed',
        },
        progress: 100,
      },
    })

    // Create one application from existing user (startup that's already onboarded)
    await prisma.applicationSubmission.create({
      data: {
        applicationId: application.id,
        applicantEmail: startupUser.email,
        applicantFirstName: startupUser.firstName,
        applicantLastName: startupUser.lastName,
        companyName: 'StartupCo',
        userId: startupUser.id, // This user is already on the platform
        status: 'ONBOARDED',
        submittedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000), // 2 weeks ago
        responses: {
          company_name: 'StartupCo',
          description: 'Digital marketplace for local artisans',
          team_size: '1-2',
          funding_stage: 'Pre-seed',
        },
        progress: 100,
      },
    })

    console.log('✅ Sample application submissions created')

    // Create sample events
    const workshopEvent = await prisma.event.create({
      data: {
        workspaceId: workspace.id,
        creatorId: adminUser.id,
        title: 'Startup Pitch Workshop',
        description: 'Learn how to create compelling investor pitches',
        type: 'WORKSHOP',
        isPublic: true,
        isVirtual: true,
        startDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 1 week from now
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000), // 2 hours later
        location: 'Virtual',
        virtualLink: 'https://zoom.us/meeting/demo',
        maxAttendees: 100,
        timezone: 'UTC',
        isRecurring: false,
        waitingRoom: true,
        capacity: 100,
        isRecorded: true,
        autoRecord: true,
        agenda: 'Introduction to pitch decks, key components, practice session',
        instructions: 'Please join 5 minutes early and have your pitch deck ready',
        tags: ['workshop', 'pitch', 'startup'],
      },
    })

    const networkingEvent = await prisma.event.create({
      data: {
        workspaceId: workspace.id,
        creatorId: adminUser.id,
        title: 'Founder Networking Night',
        description: 'Connect with other founders and mentors',
        type: 'NETWORKING',
        isPublic: true,
        isVirtual: false,
        startDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 2 weeks from now
        endDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000), // 3 hours later
        location: 'San Francisco, CA',
        maxAttendees: 50,
        timezone: 'America/Los_Angeles',
        isRecurring: false,
        waitingRoom: false,
        capacity: 50,
        isRecorded: false,
        autoRecord: false,
        agenda: 'Networking, panel discussion, Q&A',
        tags: ['networking', 'founders', 'mentors'],
      },
    })

    console.log('✅ Sample events created')

    // Create sample resources
    await prisma.resource.create({
      data: {
        workspaceId: workspace.id,
        creatorId: adminUser.id,
        title: 'Startup Toolkit',
        description: 'Essential templates and guides for startups',
        type: 'DOCUMENT',
        isPublic: true,
        tags: ['templates', 'business-plan', 'legal'],
        category: 'Templates',
        downloadCount: 0,
      },
    })

    await prisma.resource.create({
      data: {
        workspaceId: workspace.id,
        creatorId: adminUser.id,
        title: 'Fundraising 101 Video',
        description: 'Complete guide to raising your first round',
        type: 'VIDEO',
        isPublic: false,
        tags: ['fundraising', 'investment', 'video-course'],
        category: 'Education',
        downloadCount: 0,
      },
    })

    console.log('✅ Sample resources created')

    // Create sample notifications
    await prisma.notification.create({
      data: {
        workspaceId: workspace.id,
        userId: startupUser.id,
        title: 'Welcome to Demo Accelerator!',
        message: 'Welcome to our accelerator program. Check out the upcoming events and resources.',
        type: 'INFO',
      },
    })

    await prisma.notification.create({
      data: {
        workspaceId: workspace.id,
        userId: startupUser.id,
        title: 'New Workshop Available',
        message: 'A new pitch workshop has been scheduled. Register now to secure your spot.',
        type: 'EVENT',
        actionUrl: `/events/${workshopEvent.id}`,
      },
    })

    console.log('✅ Sample notifications created')

    // Create sample mentorship assignment
    await prisma.mentorshipAssignment.create({
      data: {
        workspaceId: workspace.id,
        mentorId: adminUser.id, // Admin as mentor
        menteeId: startupUser.id, // Startup user as mentee
        status: 'ACTIVE',
        totalMeetings: 1,
        lastMeetingAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 1 week ago
        nextMeetingDue: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000), // 3 weeks from now
        notes: 'Initial mentorship assignment for startup guidance',
        createdById: adminUser.id,
      },
    })

    console.log('✅ Sample mentorship assignment created')

    // Create sample email template
    await prisma.emailTemplate.create({
      data: {
        workspaceId: workspace.id,
        name: 'Welcome Invitation',
        subject: 'Welcome to {{workspace_name}}',
        type: 'INVITATION',
        description: 'Default invitation template for new members',
        content: `
          <h2>Welcome to {{workspace_name}}!</h2>
          <p>Hi {{first_name}},</p>
          <p>You've been invited to join our accelerator program. Click the link below to accept your invitation:</p>
          <a href="{{invitation_link}}">Accept Invitation</a>
          <p>Best regards,<br>{{workspace_name}} Team</p>
        `,
        requiredVariables: ['workspace_name', 'first_name', 'invitation_link'],
        optionalVariables: ['personal_message'],
        isActive: true,
        isDefault: true,
        createdBy: adminUser.id,
      },
    })

    console.log('✅ Sample email template created')

    // Update application submission count
    await prisma.application.update({
      where: { id: application.id },
      data: { submissionCount: 3 },
    })

    console.log('🎉 Database seeded successfully!')
    console.log('\n📧 Test credentials:')
    console.log('Admin: admin@starboard.com / admin123')
    console.log('User: user@starboard.com / user123')
    console.log('Startup: startup@example.com / user123')
    console.log('\n🏢 Workspace: demo-accelerator')
    console.log('🎯 Application ID: sample-application-id')
  } catch (error) {
    console.error('❌ Error seeding database:', error)
    throw error
  }
}

seed()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })