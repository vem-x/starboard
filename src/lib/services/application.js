import { prisma } from '../database.js'
import { handleDatabaseError } from '../database.js'

export const applicationService = {
  // ==========================================
  // APPLICATION CRUD OPERATIONS
  // ==========================================

  async create(data) {
    try {
      return await prisma.application.create({
        data: {
          ...data,
          formFields: {
            create: data.formFields || [],
          },
        },
        include: {
          formFields: {
            orderBy: { order: 'asc' },
          },
          workspace: true,
        },
      })
    } catch (error) {
      throw handleDatabaseError(error)
    }
  },

  async findSubmissionByEmail(applicationId, email) {
    try {
      return await prisma.applicationSubmission.findFirst({
        where: {
          applicationId,
          applicantEmail: email.toLowerCase().trim(),
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          application: {
            include: {
              workspace: true,
              formFields: {
                orderBy: { order: 'asc' },
              },
            },
          },
        },
      })
    } catch (error) {
      throw handleDatabaseError(error)
    }
  },

  async incrementSubmissionCount(applicationId) {
    await prisma.application.update({
      where: { id: applicationId },
      data: {
        submissionCount: {
          increment: 1,
        },
      },
    })
  },

  async findById(id) {
    try {
      return await prisma.application.findUnique({
        where: { id },
        include: {
          formFields: {
            orderBy: { order: 'asc' },
          },
          workspace: true,

          submissions: {
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                },
              },
            },
          },
        },
      })
    } catch (error) {
      throw handleDatabaseError(error)
    }
  },

  async findByWorkspace(workspaceId, options = {}) {
    try {
      const { includeInactive = false, page = 1, limit = 10 } = options

      return await prisma.application.findMany({
        where: {
          workspaceId,
          ...(includeInactive ? {} : { isActive: true }),
        },
        include: {
          formFields: {
            orderBy: { order: 'asc' },
          },

          _count: {
            select: {
              submissions: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      })
    } catch (error) {
      throw handleDatabaseError(error)
    }
  },

  async findByWorkspaces(workspaceIds, options = {}) {
    try {
      const { includeInactive = false, page = 1, limit = 50 } = options

      return await prisma.application.findMany({
        where: {
          workspaceId: { in: workspaceIds },
          ...(includeInactive ? {} : { isActive: true }),
        },
        include: {
          formFields: {
            orderBy: { order: 'asc' },
          },
          workspace: {
            select: {
              id: true,
              name: true,
            },
          },
          creator: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          _count: {
            select: {
              submissions: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      })
    } catch (error) {
      throw handleDatabaseError(error)
    }
  },

  async findPublicApplications(options = {}) {
    try {
      const { page = 1, limit = 10 } = options
      const now = new Date()

      return await prisma.application.findMany({
        where: {
          isActive: true,
          isPublic: true,
          OR: [{ openDate: null }, { openDate: { lte: now } }],
          OR: [{ closeDate: null }, { closeDate: { gte: now } }],
        },
        include: {
          workspace: {
            select: {
              id: true,
              name: true,
              description: true,
            },
          },
          formFields: {
            where: { isVisible: true },
            orderBy: { order: 'asc' },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      })
    } catch (error) {
      throw handleDatabaseError(error)
    }
  },

  async update(id, data) {
    try {
      return await prisma.application.update({
        where: { id },
        data,
        include: {
          formFields: {
            orderBy: { order: 'asc' },
          },
          workspace: true,
        },
      })
    } catch (error) {
      throw handleDatabaseError(error)
    }
  },

  async delete(id) {
    try {
      return await prisma.application.delete({
        where: { id },
      })
    } catch (error) {
      throw handleDatabaseError(error)
    }
  },

  // ==========================================
  // FORM FIELD OPERATIONS
  // ==========================================

  async updateFormFields(applicationId, fields) {
    try {
      // Delete existing fields
      await prisma.applicationField.deleteMany({
        where: { applicationId },
      })

      // Create new fields
      if (fields && fields.length > 0) {
        await prisma.applicationField.createMany({
          data: fields.map((field, index) => ({
            ...field,
            applicationId,
            order: field.order || index,
          })),
        })
      }

      // Return updated application
      return await this.findById(applicationId)
    } catch (error) {
      throw handleDatabaseError(error)
    }
  },

  // ==========================================
  // SUBMISSION OPERATIONS
  // ==========================================

  async createSubmission(data) {
    try {
      return await prisma.applicationSubmission.create({
        data,
        include: {
          application: {
            include: {
              workspace: true,
              formFields: {
                orderBy: { order: 'asc' },
              },
            },
          },
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      })
    } catch (error) {
      throw handleDatabaseError(error)
    }
  },

  async findSubmissionById(id) {
    try {
      return await prisma.applicationSubmission.findUnique({
        where: { id },
        include: {
          application: {
            include: {
              workspace: true,
              formFields: {
                orderBy: { order: 'asc' },
              },
            },
          },
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          reviewer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          comments: {
            include: {
              author: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                },
              },
            },
            orderBy: { createdAt: 'desc' },
          },
        },
      })
    } catch (error) {
      throw handleDatabaseError(error)
    }
  },

  async findSubmissionsByApplication(applicationId, options = {}) {
    try {
      const { status, page = 1, limit = 10, includeReviewed = true, search, currentStep, fetchAll = false } = options

      // Build the where clause
      const whereClause = {
        applicationId,
        ...(status ? { status } : {}),
        ...(includeReviewed ? {} : { status: { not: 'DRAFT' } }),
        ...(currentStep ? { currentStep: parseInt(currentStep) } : {}),
      }

      // Add search filter if provided
      if (search) {
        whereClause.OR = [
          { applicantEmail: { contains: search, mode: 'insensitive' } },
          { user: { email: { contains: search, mode: 'insensitive' } } },
        ]
      }

      return await prisma.applicationSubmission.findMany({
        where: whereClause,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          reviewer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: { submittedAt: 'desc' },
        ...(!fetchAll && { skip: (page - 1) * limit, take: limit }),
      })
    } catch (error) {
      throw handleDatabaseError(error)
    }
  },

  async updateSubmission(id, data) {
    try {
      return await prisma.applicationSubmission.update({
        where: { id },
        data,
        include: {
          application: {
            include: {
              workspace: true,
              formFields: {
                orderBy: { order: 'asc' },
              },
            },
          },
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          reviewer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      })
    } catch (error) {
      throw handleDatabaseError(error)
    }
  },

  async submitApplication(submissionId, responses) {
    try {
      return await prisma.applicationSubmission.update({
        where: { id: submissionId },
        data: {
          responses,
          status: 'SUBMITTED',
          submittedAt: new Date(),
          progress: 100,
        },
        include: {
          application: {
            include: {
              workspace: true,
            },
          },
        },
      })
    } catch (error) {
      throw handleDatabaseError(error)
    }
  },

  async reviewSubmission(submissionId, reviewData) {
    try {
      const { reviewerId, status, score, notes, reviewResponses } = reviewData

      return await prisma.applicationSubmission.update({
        where: { id: submissionId },
        data: {
          status,
          score,
          reviewNotes: notes,
          reviewData: reviewResponses,
          reviewedBy: reviewerId,
          reviewedAt: new Date(),
        },
        include: {
          application: {
            include: {
              workspace: true,
            },
          },
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      })
    } catch (error) {
      throw handleDatabaseError(error)
    }
  },

  // ==========================================
  // COMMENT OPERATIONS
  // ==========================================

  async addComment(submissionId, authorId, content, isInternal = true) {
    try {
      return await prisma.applicationComment.create({
        data: {
          submissionId,
          authorId,
          content,
          isInternal,
        },
        include: {
          author: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      })
    } catch (error) {
      throw handleDatabaseError(error)
    }
  },

  // ==========================================
  // INVITATION OPERATIONS
  // ==========================================

  async sendInvitation(submissionId, invitationToken) {
    try {
      return await prisma.applicationSubmission.update({
        where: { id: submissionId },
        data: {
          status: 'INVITED',
          invitationSent: true,
          invitationToken,
          invitedAt: new Date(),
        },
      })
    } catch (error) {
      throw handleDatabaseError(error)
    }
  },

  async findByInvitationToken(token) {
    try {
      return await prisma.applicationSubmission.findUnique({
        where: { invitationToken: token },
        include: {
          application: {
            include: {
              workspace: true,
            },
          },
        },
      })
    } catch (error) {
      throw handleDatabaseError(error)
    }
  },

  // ==========================================
  // ANALYTICS & STATS
  // ==========================================

  async getSubmissionCount(applicationId, options = {}) {
    try {
      const { status, search, currentStep } = options

      // Build the where clause
      const whereClause = {
        applicationId,
        ...(status ? { status } : {}),
        ...(currentStep ? { currentStep: parseInt(currentStep) } : {}),
      }

      // Add search filter if provided
      if (search) {
        whereClause.OR = [
          { applicantEmail: { contains: search, mode: 'insensitive' } },
          { user: { email: { contains: search, mode: 'insensitive' } } },
        ]
      }

      return await prisma.applicationSubmission.count({
        where: whereClause,
      })
    } catch (error) {
      throw handleDatabaseError(error)
    }
  },

  async getApplicationStats(applicationId) {
    try {
      const stats = await prisma.applicationSubmission.groupBy({
        by: ['status'],
        where: { applicationId },
        _count: { id: true },
      })

      const totalSubmissions = await prisma.applicationSubmission.count({
        where: { applicationId },
      })

      const averageScore = await prisma.applicationSubmission.aggregate({
        where: {
          applicationId,
          score: { not: null },
        },
        _avg: { score: true },
      })

      return {
        totalSubmissions,
        averageScore: averageScore._avg.score,
        statusBreakdown: stats.reduce((acc, stat) => {
          acc[stat.status] = stat._count.id
          return acc
        }, {}),
        submissionsByDate: await this.getSubmissionsByDate(applicationId),
      }
    } catch (error) {
      throw handleDatabaseError(error)
    }
  },

  async getWorkspaceStats(workspaceIds) {
    try {
      const now = new Date()
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

      const [
        totalApplications,
        activeApplications,
        totalSubmissions,
        pendingReviews,
        thisWeekSubmissions,
        reviewedSubmissions,
      ] = await Promise.all([
        // Total applications
        prisma.application.count({
          where: { workspaceId: { in: workspaceIds } },
        }),

        // Active applications
        prisma.application.count({
          where: {
            workspaceId: { in: workspaceIds },
            isActive: true,
            OR: [{ closeDate: null }, { closeDate: { gte: now } }],
          },
        }),

        // Total submissions
        prisma.applicationSubmission.count({
          where: {
            application: { workspaceId: { in: workspaceIds } },
          },
        }),

        // Pending reviews
        prisma.applicationSubmission.count({
          where: {
            application: { workspaceId: { in: workspaceIds } },
            status: 'SUBMITTED',
            reviewedAt: null,
          },
        }),

        // This week submissions
        prisma.applicationSubmission.count({
          where: {
            application: { workspaceId: { in: workspaceIds } },
            submittedAt: { gte: oneWeekAgo },
          },
        }),

        // Reviewed submissions
        prisma.applicationSubmission.findMany({
          where: {
            application: { workspaceId: { in: workspaceIds } },
            status: { in: ['ACCEPTED', 'REJECTED'] },
            reviewedAt: { not: null },
          },
          select: {
            status: true,
            reviewedAt: true,
            submittedAt: true,
          },
        }),
      ])

      // Calculate acceptance rate
      const acceptedSubmissions = reviewedSubmissions.filter(s => s.status === 'ACCEPTED').length
      const acceptanceRate =
        reviewedSubmissions.length > 0
          ? Math.round((acceptedSubmissions / reviewedSubmissions.length) * 100 * 10) / 10
          : 0

      // Calculate average review time
      let avgReviewTime = 0
      if (reviewedSubmissions.length > 0) {
        const totalReviewTime = reviewedSubmissions.reduce((sum, submission) => {
          if (submission.submittedAt && submission.reviewedAt) {
            const reviewTime = new Date(submission.reviewedAt) - new Date(submission.submittedAt)
            return sum + reviewTime / (1000 * 60 * 60 * 24)
          }
          return sum
        }, 0)

        avgReviewTime = Math.round((totalReviewTime / reviewedSubmissions.length) * 10) / 10
      }

      return {
        totalApplications,
        activeApplications,
        totalSubmissions,
        pendingReviews,
        acceptanceRate,
        thisWeekSubmissions,
        avgReviewTime,
      }
    } catch (error) {
      throw handleDatabaseError(error)
    }
  },

  async getSubmissionsByDate(applicationId, days = 30) {
    try {
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - days)

      return await prisma.applicationSubmission.findMany({
        where: {
          applicationId,
          submittedAt: { gte: startDate },
        },
        select: {
          submittedAt: true,
          status: true,
        },
        orderBy: { submittedAt: 'asc' },
      })
    } catch (error) {
      throw handleDatabaseError(error)
    }
  },

  // ==========================================
  // VALIDATION HELPERS
  // ==========================================

  async validateSubmission(applicationId, responses) {
    try {
      const application = await this.findById(applicationId)
      if (!application) {
        throw new Error('Application not found')
      }

      const errors = []
      const formFields = application.formFields

      for (const field of formFields) {
        const value = responses[field.id]

        // Check required fields
        if (field.required && (!value || value === '')) {
          errors.push({
            fieldId: field.id,
            message: `${field.label} is required`,
          })
          continue
        }

        if (value) {
          // Validate based on field type
          const validationError = this.validateFieldValue(field, value)
          if (validationError) {
            errors.push({
              fieldId: field.id,
              message: validationError,
            })
          }
        }
      }

      return {
        isValid: errors.length === 0,
        errors,
      }
    } catch (error) {
      throw handleDatabaseError(error)
    }
  },

  validateFieldValue(field, value) {
    switch (field.type) {
      case 'EMAIL':
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          return 'Invalid email format'
        }
        break

      case 'PHONE':
        if (!/^\+?[\d\s\-\(\)]+$/.test(value)) {
          return 'Invalid phone number format'
        }
        break

      case 'URL':
        try {
          new URL(value)
        } catch {
          return 'Invalid URL format'
        }
        break

      case 'NUMBER':
        const num = parseFloat(value)
        if (isNaN(num)) {
          return 'Invalid number format'
        }
        if (field.minValue && num < field.minValue) {
          return `Value must be at least ${field.minValue}`
        }
        if (field.maxValue && num > field.maxValue) {
          return `Value must be at most ${field.maxValue}`
        }
        break

      case 'TEXT':
      case 'TEXTAREA':
        if (field.minLength && value.length < field.minLength) {
          return `Must be at least ${field.minLength} characters`
        }
        if (field.maxLength && value.length > field.maxLength) {
          return `Must be at most ${field.maxLength} characters`
        }
        if (field.pattern && !new RegExp(field.pattern).test(value)) {
          return 'Invalid format'
        }
        break
    }

    return null
  },
}
