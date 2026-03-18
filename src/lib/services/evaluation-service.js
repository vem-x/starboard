import { prisma } from '@/lib/database';

/**
 * Evaluation Service - Manual Evaluation System
 * Handles 2-step evaluation process: Initial Review + Interview Round
 */
export class EvaluationService {
  /**
   * Create evaluation steps for an application
   * @param {string} applicationId - Application ID
   * @param {object} step1Config - Step 1 configuration { name, type, criteria: [{ name, weight, order }] }
   * @param {object} step2Config - Step 2 configuration { name, type, criteria: [{ name, weight, order }] }
   * @returns {Promise<{step1, step2}>} Created steps
   */
  static async createSteps(applicationId, step1Config, step2Config) {
    // Check if steps already exist
    const existing = await prisma.evaluationStep.findMany({
      where: { applicationId }
    });

    if (existing.length > 0) {
      throw new Error('Evaluation steps already exist for this application');
    }

    // Create both steps in a transaction with increased timeout
    const result = await prisma.$transaction(async (tx) => {
      // Create Step 1
      const step1 = await tx.evaluationStep.create({
        data: {
          applicationId,
          stepNumber: 1,
          name: step1Config.name,
          type: step1Config.type || 'INITIAL_REVIEW',
          isActive: true, // Step 1 starts active
          criteria: {
            create: step1Config.criteria.map((c) => ({
              name: c.name,
              weight: c.weight || 1.0,
              order: c.order
            }))
          }
        },
        include: { criteria: true }
      });

      // Create Step 2
      const step2 = await tx.evaluationStep.create({
        data: {
          applicationId,
          stepNumber: 2,
          name: step2Config.name,
          type: step2Config.type || 'INTERVIEW',
          isActive: false, // Step 2 starts inactive
          criteria: {
            create: step2Config.criteria.map((c) => ({
              name: c.name,
              weight: c.weight || 1.0,
              order: c.order
            }))
          }
        },
        include: { criteria: true }
      });

      return { step1, step2 };
    }, {
      timeout: 15000 // Increase timeout to 15 seconds for complex nested operations
    });

    return result;
  }

  /**
   * Submit scores for a submission
   * @param {string} submissionId - Submission ID
   * @param {string} stepId - Step ID
   * @param {string} evaluatorId - Judge User ID
   * @param {object} criteriaScores - { criteriaId: score, ... }
   * @param {string} notes - Optional notes
   * @returns {Promise<object>} Created score
   */
  static async submitScore(submissionId, stepId, evaluatorId, criteriaScores, notes = null) {
    // Get criteria for this step
    const step = await prisma.evaluationStep.findUnique({
      where: { id: stepId },
      include: { criteria: true }
    });

    if (!step) {
      throw new Error('Evaluation step not found');
    }

    // Calculate weighted total score
    let totalScore = 0;
    let totalWeight = 0;

    for (const criterion of step.criteria) {
      const score = criteriaScores[criterion.id];
      if (score === undefined || score === null) {
        throw new Error(`Missing score for criterion: ${criterion.name}`);
      }
      totalScore += score * criterion.weight;
      totalWeight += criterion.weight;
    }

    const weightedScore = totalWeight > 0 ? totalScore / totalWeight : 0;

    // Check if evaluator has already scored this submission
    const existing = await prisma.applicationScore.findUnique({
      where: {
        submissionId_stepId_judgeId: {
          submissionId,
          stepId,
          judgeId: evaluatorId
        }
      }
    });

    if (existing) {
      throw new Error('Judge has already scored this submission');
    }

    // Create score
    const score = await prisma.applicationScore.create({
      data: {
        submissionId,
        stepId,
        judgeId: evaluatorId,
        scores: criteriaScores,
        totalScore: weightedScore,
        notes
      },
      include: {
        judge: { select: { firstName: true, lastName: true } },
        step: { include: { criteria: true } }
      }
    });

    return score;
  }

  /**
   * Get aggregate score for a submission in a step
   * @param {string} submissionId - Submission ID
   * @param {string} stepId - Step ID
   * @param {number} totalJudges - Total number of assigned evaluators (optional)
   * @param {number} cutoffScore - Minimum passing score (optional)
   * @param {number} requiredEvaluatorPercentage - Required percentage of evaluators (default 75)
   * @returns {Promise<{averageScore, evaluatorCount, scores, isValid, validityMessage, passed, meetsCutoff, meetsEvaluatorRequirement}>} Aggregate data
   */
  static async getAggregateScore(submissionId, stepId, totalJudges = null, cutoffScore = 0, requiredEvaluatorPercentage = 75) {
    const scores = await prisma.applicationScore.findMany({
      where: {
        submissionId,
        stepId
      },
      include: {
        judge: { select: { id: true, firstName: true, lastName: true } }
      }
    });

    if (scores.length === 0) {
      return {
        averageScore: null,
        evaluatorCount: 0,
        totalJudges,
        scores: [],
        isValid: false,
        validityMessage: 'No evaluators have scored this submission yet',
        passed: false,
        meetsCutoff: false,
        meetsEvaluatorRequirement: false,
        evaluatorPercentage: 0
      };
    }

    // Calculate evaluator percentage validity rule
    let meetsEvaluatorRequirement = true;
    let validityMessage = null;
    let evaluatorPercentage = 100;

    if (totalJudges !== null && totalJudges > 0) {
      evaluatorPercentage = (scores.length / totalJudges) * 100;
      if (evaluatorPercentage < requiredEvaluatorPercentage) {
        meetsEvaluatorRequirement = false;
        validityMessage = `Only ${scores.length} of ${totalJudges} evaluators have scored (need ${requiredEvaluatorPercentage}% = ${Math.ceil(totalJudges * (requiredEvaluatorPercentage / 100))} evaluators)`;
      }
    }

    const total = scores.reduce((sum, score) => sum + score.totalScore, 0);
    const average = total / scores.length;

    // Check if meets cutoff
    const meetsCutoff = cutoffScore > 0 ? average >= cutoffScore : true;

    // Submission passes if it meets both cutoff AND evaluator requirement
    const passed = meetsCutoff && meetsEvaluatorRequirement;

    // Determine status
    let status = 'PENDING';
    if (meetsEvaluatorRequirement) {
      status = meetsCutoff ? 'PASSED' : 'FAILED';
    }

    return {
      averageScore: meetsEvaluatorRequirement ? average : null,
      evaluatorCount: scores.length,
      totalJudges,
      evaluatorPercentage,
      isValid: meetsEvaluatorRequirement,
      validityMessage,
      passed,
      meetsCutoff,
      meetsEvaluatorRequirement,
      status,
      cutoffScore,
      scores: scores.map(s => ({
        evaluatorId: s.judge.id,
        evaluatorName: `${s.judge.firstName} ${s.judge.lastName}`,
        totalScore: s.totalScore,
        scoredAt: s.createdAt
      }))
    };
  }

  /**
   * Get scoreboard for a step (all submissions with aggregate scores)
   * @param {string} stepId - Step ID
   * @param {object} options - Optional filters { submissionId }
   * @returns {Promise<Array>} Submissions with scores
   */
  static async getStepScoreboard(stepId, options = {}) {
    // Single query for step + app settings (no double-fetch)
    const step = await prisma.evaluationStep.findUnique({
      where: { id: stepId },
      include: {
        application: {
          select: {
            id: true,
            cutoffScores: true,
            evaluationSettings: true
          }
        },
        criteria: true
      }
    });

    if (!step) {
      throw new Error('Evaluation step not found');
    }

    const cutoffScores = step.application?.cutoffScores
      ? (typeof step.application.cutoffScores === 'string' ? JSON.parse(step.application.cutoffScores) : step.application.cutoffScores)
      : { step1: 0, step2: 0 };

    const evalSettings = step.application?.evaluationSettings
      ? (typeof step.application.evaluationSettings === 'string' ? JSON.parse(step.application.evaluationSettings) : step.application.evaluationSettings)
      : { minScore: 1, maxScore: 10, requiredEvaluatorPercentage: 75 };

    const cutoff = step.stepNumber === 1 ? cutoffScores.step1 : cutoffScores.step2;

    // Run submissions + judges queries in parallel
    const [submissions, allJudges] = await Promise.all([
      prisma.applicationSubmission.findMany({
        where: {
          applicationId: step.applicationId,
          currentStep: { gte: 1 },
          ...(options.submissionId ? { id: options.submissionId } : {})
        },
        include: {
          scores: {
            where: { stepId },
            include: {
              judge: {
                select: { id: true, firstName: true, lastName: true }
              }
            }
          }
        },
        orderBy: { submittedAt: 'asc' }
      }),
      prisma.applicationScore.findMany({
        where: { stepId },
        select: { judgeId: true },
        distinct: ['judgeId']
      })
    ]);

    const totalJudges = allJudges.length;

    const scoreboard = submissions.map((submission) => {
      const scores = submission.scores;
      const evaluatorCount = scores.length;

      let averageScore = null;
      let isValid = true;
      let validityMessage = null;
      let status = 'PENDING';
      let meetsCutoff = false;
      let meetsEvaluatorRequirement = false;
      let evaluatorPercentage = 0;

      if (evaluatorCount > 0) {
        const total = scores.reduce((sum, s) => sum + s.totalScore, 0);
        averageScore = total / evaluatorCount;

        // Calculate evaluator percentage
        if (totalJudges > 0) {
          evaluatorPercentage = (evaluatorCount / totalJudges) * 100;
          meetsEvaluatorRequirement = evaluatorPercentage >= evalSettings.requiredEvaluatorPercentage;

          if (!meetsEvaluatorRequirement) {
            isValid = false;
            validityMessage = `Only ${evaluatorCount}/${totalJudges} evaluators scored (need ${evalSettings.requiredEvaluatorPercentage}%)`;
          }
        }

        // Check if meets cutoff
        meetsCutoff = cutoff > 0 ? averageScore >= cutoff : true;

        // Determine status
        if (meetsEvaluatorRequirement) {
          status = meetsCutoff ? 'PASSED' : 'FAILED';
          isValid = true; // Valid if evaluator requirement is met
        }
      }

      return {
        id: submission.id, // Use 'id' for consistency
        submissionId: submission.id, // Keep for backwards compatibility
        applicantName: `${submission.applicantFirstName} ${submission.applicantLastName}`,
        applicantEmail: submission.applicantEmail,
        companyName: submission.companyName,
        currentStep: submission.currentStep,
        averageScore,
        evaluatorCount,
        totalJudges,
        evaluatorPercentage,
        isValid,
        validityMessage,
        status,
        meetsCutoff,
        meetsEvaluatorRequirement,
        cutoffScore: cutoff,
        submittedAt: submission.submittedAt,
        evaluators: scores.map(s => ({
          name: `${s.judge.firstName} ${s.judge.lastName}`,
          score: s.totalScore
        })),
        // Include detailed scores for admin view
        scores: scores.map(s => ({
          id: s.id,
          totalScore: s.totalScore,
          notes: s.notes,
          createdAt: s.createdAt,
          judge: {
            id: s.judge.id,
            firstName: s.judge.firstName,
            lastName: s.judge.lastName
          }
        }))
      };
    });

    return scoreboard;
  }

  /**
   * Manually advance selected submissions to Step 2
   * @param {string[]} submissionIds - Array of submission IDs
   * @returns {Promise<{count: number}>} Count of advanced submissions
   */
  static async manuallyAdvanceToStep2(submissionIds) {
    const result = await prisma.applicationSubmission.updateMany({
      where: {
        id: { in: submissionIds }
      },
      data: {
        currentStep: 2
      }
    });

    return { count: result.count };
  }

  /**
   * Manually admit selected submissions
   * @param {string[]} submissionIds - Array of submission IDs
   * @returns {Promise<{count: number}>} Count of admitted submissions
   */
  static async manuallyAdmit(submissionIds) {
    const result = await prisma.applicationSubmission.updateMany({
      where: {
        id: { in: submissionIds }
      },
      data: {
        status: 'ACCEPTED',
        currentStep: null // Clear step when admitted
      }
    });

    return { count: result.count };
  }

  /**
   * Generate interview slots for a step
   * @param {string} stepId - Step ID
   * @param {Array} dateTimeSlots - Array of { date, startTime, endTime, zoomLink }
   * @returns {Promise<Array>} Created slots
   */
  static async generateInterviewSlots(stepId, dateTimeSlots) {
    const slots = await prisma.interviewSlot.createMany({
      data: dateTimeSlots.map((slot) => ({
        stepId,
        date: new Date(slot.date),
        startTime: slot.startTime,
        endTime: slot.endTime,
        zoomLink: slot.zoomLink || null
      }))
    });

    // Return created slots
    const createdSlots = await prisma.interviewSlot.findMany({
      where: { stepId },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }]
    });

    return createdSlots;
  }

  /**
   * Book an interview slot for a submission
   * @param {string} submissionId - Submission ID
   * @param {string} slotId - Slot ID
   * @returns {Promise<object>} Booked slot
   */
  static async bookInterviewSlot(submissionId, slotId) {
    // Check if slot is already booked
    const slot = await prisma.interviewSlot.findUnique({
      where: { id: slotId }
    });

    if (!slot) {
      throw new Error('Interview slot not found');
    }

    if (slot.submissionId) {
      throw new Error('This slot is already booked');
    }

    // Check if submission already has a slot
    const existingBooking = await prisma.interviewSlot.findUnique({
      where: { submissionId: submissionId }
    });

    if (existingBooking) {
      throw new Error('Submission already has a booked slot');
    }

    // Book the slot
    const bookedSlot = await prisma.interviewSlot.update({
      where: { id: slotId },
      data: {
        submissionId,
        bookedAt: new Date()
      },
      include: {
        submission: {
          select: {
            applicantFirstName: true,
            applicantLastName: true,
            applicantEmail: true
          }
        }
      }
    });

    return bookedSlot;
  }

  /**
   * Get evaluation status for a submission
   * @param {string} submissionId - Submission ID
   * @returns {Promise<object>} Evaluation status
   */
  static async getSubmissionEvaluationStatus(submissionId) {
    const submission = await prisma.applicationSubmission.findUnique({
      where: { id: submissionId },
      include: {
        application: {
          include: {
            evaluationSteps: {
              include: {
                criteria: true
              }
            }
          }
        },
        scores: {
          include: {
            step: true,
            judge: { select: { firstName: true, lastName: true } }
          }
        },
        interviewSlot: {
          include: {
            step: true
          }
        }
      }
    });

    if (!submission) {
      throw new Error('Submission not found');
    }

    const currentStep = submission.currentStep || 1;
    const steps = submission.application.evaluationSteps;

    // Group scores by step
    const scoresByStep = {};
    for (const score of submission.scores) {
      const stepId = score.step.id;
      if (!scoresByStep[stepId]) {
        scoresByStep[stepId] = [];
      }
      scoresByStep[stepId].push(score);
    }

    // Calculate aggregate scores for each step
    const stepStatuses = steps.map((step) => {
      const stepScores = scoresByStep[step.id] || [];
      const evaluatorCount = stepScores.length;
      let averageScore = null;

      if (evaluatorCount > 0) {
        const total = stepScores.reduce((sum, s) => sum + s.totalScore, 0);
        averageScore = total / evaluatorCount;
      }

      return {
        stepNumber: step.stepNumber,
        stepName: step.name,
        stepType: step.type,
        averageScore,
        evaluatorCount,
        isCurrentStep: step.stepNumber === currentStep
      };
    });

    return {
      submissionId: submission.id,
      currentStep,
      status: submission.status,
      steps: stepStatuses,
      interviewSlot: submission.interviewSlot ? {
        date: submission.interviewSlot.date,
        startTime: submission.interviewSlot.startTime,
        endTime: submission.interviewSlot.endTime,
        zoomLink: submission.interviewSlot.zoomLink
      } : null
    };
  }

  /**
   * Get available interview slots for a step
   * @param {string} stepId - Step ID
   * @returns {Promise<Array>} Available slots
   */
  static async getAvailableSlots(stepId) {
    const slots = await prisma.interviewSlot.findMany({
      where: {
        stepId,
        submissionId: null // Only unbooked slots
      },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }]
    });

    return slots;
  }

  /**
   * Get all slots for a step (including booked)
   * @param {string} stepId - Step ID
   * @returns {Promise<Array>} All slots
   */
  static async getAllSlots(stepId) {
    const slots = await prisma.interviewSlot.findMany({
      where: { stepId },
      include: {
        submission: {
          select: {
            applicantFirstName: true,
            applicantLastName: true,
            applicantEmail: true
          }
        }
      },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }]
    });

    return slots;
  }
}

export default EvaluationService;
