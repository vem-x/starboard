import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { applicationService } from '@/lib/services/application'
import { apiResponse, apiError, handleApiError } from '@/lib/api-utils'
import { logger, createRequestTimer } from '@/lib/logger'
import { prisma } from '@/lib/database'
import { EvaluationService } from '@/lib/services/evaluation-service'

export async function GET(request, { params }) {
  const timer = createRequestTimer()
  const { applicationId } = await params

  try {
    logger.apiRequest('GET', `/api/applications/${applicationId}/submissions`)

    // Check authentication
    const session = await auth()
    if (!session?.user?.id) {
      timer.log('GET', `/api/applications/${applicationId}/submissions`, 401)
      return apiError('Unauthorized', 401)
    }

    // Get query parameters
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const search = searchParams.get('search')
    const currentStep = searchParams.get('currentStep')
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = parseInt(searchParams.get('limit') || '50', 10)

    // Verify application exists and user has access
    const application = await applicationService.findById(applicationId)
    if (!application) {
      timer.log('GET', `/api/applications/${applicationId}/submissions`, 404)
      return apiError('Application not found', 404)
    }

    // Get submissions
    const submissions = await applicationService.findSubmissionsByApplication(applicationId, {
      status,
      search,
      currentStep,
      page,
      limit,
    })

    // Get total count for pagination
    const totalCount = await applicationService.getSubmissionCount(applicationId, { status, search, currentStep })

    // Batch fetch all static data in parallel
    const [evaluationSteps, app, uniqueJudges] = await Promise.all([
      prisma.evaluationStep.findMany({
        where: { applicationId },
        select: { id: true, stepNumber: true }
      }),
      prisma.application.findUnique({
        where: { id: applicationId },
        select: { cutoffScores: true, evaluationSettings: true }
      }),
      prisma.applicationScore.findMany({
        where: { submission: { applicationId } },
        select: { judgeId: true },
        distinct: ['judgeId']
      })
    ])

    const cutoffScores = app?.cutoffScores
      ? (typeof app.cutoffScores === 'string' ? JSON.parse(app.cutoffScores) : app.cutoffScores)
      : { step1: 0, step2: 0 }

    const evalSettings = app?.evaluationSettings
      ? (typeof app.evaluationSettings === 'string' ? JSON.parse(app.evaluationSettings) : app.evaluationSettings)
      : { minScore: 1, maxScore: 10, requiredEvaluatorPercentage: 75 }

    const totalJudges = uniqueJudges.length || 1

    // Batch fetch all scores for all submissions in ONE query (eliminates N+1)
    const submissionIds = submissions.map(s => s.id)
    const stepIds = evaluationSteps.map(s => s.id)

    const allScores = stepIds.length > 0 && submissionIds.length > 0
      ? await prisma.applicationScore.findMany({
          where: { submissionId: { in: submissionIds }, stepId: { in: stepIds } },
          select: { submissionId: true, stepId: true, totalScore: true }
        })
      : []

    // Group scores by submissionId+stepId for O(1) lookup
    const scoreMap = {}
    for (const score of allScores) {
      const key = `${score.submissionId}:${score.stepId}`
      if (!scoreMap[key]) scoreMap[key] = []
      scoreMap[key].push(score.totalScore)
    }

    // Compute aggregate in memory — no more per-submission DB calls
    const enrichedSubmissions = submissions.map((submission) => {
      const stepNum = submission.currentStep || 1
      const step = evaluationSteps.find(s => s.stepNumber === stepNum)

      if (!step) return { ...submission, evaluationProgress: null }

      const cutoff = stepNum === 1 ? cutoffScores.step1 : cutoffScores.step2
      const scores = scoreMap[`${submission.id}:${step.id}`] || []
      const evaluatorCount = scores.length

      if (evaluatorCount === 0) {
        return {
          ...submission,
          evaluationProgress: {
            averageScore: null, scored: 0, total: totalJudges,
            evaluatorPercentage: 0, passed: false, meetsCutoff: false,
            meetsEvaluatorRequirement: false, status: 'PENDING', cutoffScore: cutoff
          }
        }
      }

      const average = scores.reduce((s, v) => s + v, 0) / evaluatorCount
      const evaluatorPercentage = (evaluatorCount / totalJudges) * 100
      const meetsEvaluatorRequirement = evaluatorPercentage >= (evalSettings.requiredEvaluatorPercentage || 75)
      const meetsCutoff = cutoff > 0 ? average >= cutoff : true
      const passed = meetsCutoff && meetsEvaluatorRequirement

      return {
        ...submission,
        evaluationProgress: {
          averageScore: meetsEvaluatorRequirement ? average : null,
          scored: evaluatorCount,
          total: totalJudges,
          evaluatorPercentage,
          passed,
          meetsCutoff,
          meetsEvaluatorRequirement,
          status: meetsEvaluatorRequirement ? (meetsCutoff ? 'PASSED' : 'FAILED') : 'PENDING',
          cutoffScore: cutoff
        }
      }
    })

    timer.log('GET', `/api/applications/${applicationId}/submissions`, 200)

    return apiResponse({
      submissions: enrichedSubmissions,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
    })
  } catch (error) {
    logger.apiError('GET', `/api/applications/${applicationId}/submissions`, error)
    timer.log('GET', `/api/applications/${applicationId}/submissions`, 500)
    return handleApiError(error)
  }
}
