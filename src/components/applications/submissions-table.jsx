'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import {
  Settings,
  Filter,
  CheckCircle,
  XCircle,
  Trash2,
  ArrowRight,
  Eye,
  Download,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import SubmissionsTableConfig from './submissions-table-config';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { PERMISSIONS } from '@/lib/utils/permissions';

export default function SubmissionsTable({ applicationId }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { hasPermission } = usePermissions();
  const [submissions, setSubmissions] = useState([]);
  const [formFields, setFormFields] = useState([]);
  const [pinnedFields, setPinnedFields] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [filter, setFilter] = useState(() => searchParams.get('step') || 'step1');
  const [sortOrder, setSortOrder] = useState(() => searchParams.get('sort') || 'date');
  const [isLoading, setIsLoading] = useState(true);
  const [isActing, setIsActing] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [evaluationData, setEvaluationData] = useState(null);
  const [cutoffScores, setCutoffScores] = useState({ step1: 0, step2: 0 });
  const [evalSettings, setEvalSettings] = useState({ requiredEvaluatorPercentage: 75, minScore: 1, maxScore: 10 });

  // Pagination state
  const [currentPage, setCurrentPage] = useState(() => parseInt(searchParams.get('page') || '1', 10));
  const [totalPages, setTotalPages] = useState(1);
  const [totalSubmissions, setTotalSubmissions] = useState(0);
  const [itemsPerPage] = useState(50);

  // Check permissions
  const canAdvance = hasPermission(PERMISSIONS.EVALUATION_ADVANCE);
  const canAdmit = hasPermission(PERMISSIONS.EVALUATION_ADMIT);

  // Load static data once on mount
  useEffect(() => {
    const loadStaticData = async () => {
      try {
        const [fieldsRes, configRes, evalRes, cutoffRes] = await Promise.all([
          fetch(`/api/applications/${applicationId}/fields`),
          fetch(`/api/applications/${applicationId}/table-config`),
          fetch(`/api/applications/${applicationId}/evaluation/steps`),
          fetch(`/api/applications/${applicationId}/evaluation/cutoff`),
        ]);
        const [fieldsData, configData, evalData, cutoffData] = await Promise.all([
          fieldsRes.json(), configRes.json(), evalRes.json(), cutoffRes.json()
        ]);
        if (fieldsRes.ok) setFormFields(fieldsData.data || []);
        if (configRes.ok && configData.data?.pinnedFields) setPinnedFields(configData.data.pinnedFields);
        if (evalRes.ok && evalData.data) setEvaluationData(evalData.data);
        if (cutoffRes.ok && cutoffData.data?.cutoffScores) {
          const cutoff = typeof cutoffData.data.cutoffScores === 'string'
            ? JSON.parse(cutoffData.data.cutoffScores) : cutoffData.data.cutoffScores;
          setCutoffScores(cutoff);
          if (cutoffData.data?.evaluationSettings) {
            const settings = typeof cutoffData.data.evaluationSettings === 'string'
              ? JSON.parse(cutoffData.data.evaluationSettings) : cutoffData.data.evaluationSettings;
            setEvalSettings(settings);
          }
        }
      } catch (error) {
        console.error('Error loading static data:', error);
      }
    };
    loadStaticData();
  }, [applicationId]);

  // Reset to page 1 when filter or sort changes
  useEffect(() => {
    setCurrentPage(1);
  }, [filter, sortOrder]);

  // Sync page, filter, sort to URL
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', currentPage.toString());
    params.set('step', filter);
    params.set('sort', sortOrder);
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [currentPage, filter, sortOrder]);

  // Load submissions when page, filter, or sort changes
  useEffect(() => {
    loadData();
  }, [applicationId, currentPage, filter, sortOrder]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const queryParams = new URLSearchParams({
        page: currentPage.toString(),
        limit: itemsPerPage.toString(),
        sort: sortOrder,
      });
      if (filter !== 'all') {
        queryParams.set('currentStep', filter === 'step1' ? '1' : '2');
      }
      const subRes = await fetch(`/api/applications/${applicationId}/submissions?${queryParams}`);
      const subData = await subRes.json();
      if (subRes.ok) {
        setSubmissions(subData.data?.submissions || []);
        if (subData.data?.pagination) {
          setTotalPages(subData.data.pagination.totalPages || 1);
          setTotalSubmissions(subData.data.pagination.total || 0);
        }
      }
    } catch (error) {
      console.error('Error loading submissions:', error);
      toast.error('Failed to load submissions');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectAll = (checked) => {
    if (checked) {
      const filteredSubmissions = getFilteredSubmissions();
      setSelectedIds(filteredSubmissions.map(s => s.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleAdvance = async () => {
    if (selectedIds.length === 0) {
      toast.error('Please select at least one submission');
      return;
    }

    setIsActing(true);
    try {
      const currentStep = evaluationData?.[0];
      if (!currentStep) {
        throw new Error('No evaluation step configured');
      }

      const response = await fetch(
        `/api/applications/${applicationId}/evaluation/steps/${currentStep.id}/advance`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ submissionIds: selectedIds })
        }
      );

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error?.message || 'Failed to advance submissions');
      }

      toast.success(`Advanced ${data.data.count} submissions`);
      setSelectedIds([]);
      loadData();
    } catch (error) {
      console.error('Error:', error);
      toast.error(error.message);
    } finally {
      setIsActing(false);
    }
  };

  const handleAdmit = async () => {
    if (selectedIds.length === 0) {
      toast.error('Please select at least one submission');
      return;
    }

    setIsActing(true);
    try {
      const response = await fetch(
        `/api/applications/${applicationId}/evaluation/admit`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ submissionIds: selectedIds })
        }
      );

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error?.message || 'Failed to admit submissions');
      }

      toast.success(`Admitted ${data.data.count} submissions`);
      setSelectedIds([]);
      loadData();
    } catch (error) {
      console.error('Error:', error);
      toast.error(error.message);
    } finally {
      setIsActing(false);
    }
  };

  const handleReject = async () => {
    if (selectedIds.length === 0) {
      toast.error('Please select at least one submission');
      return;
    }

    if (!confirm(`Are you sure you want to reject ${selectedIds.length} submission(s)?`)) {
      return;
    }

    setIsActing(true);
    try {
      const response = await fetch(
        `/api/applications/${applicationId}/submissions/bulk-reject`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ submissionIds: selectedIds })
        }
      );

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error?.message || 'Failed to reject submissions');
      }

      toast.success(`Rejected ${selectedIds.length} submissions`);
      setSelectedIds([]);
      loadData();
    } catch (error) {
      console.error('Error:', error);
      toast.error(error.message);
    } finally {
      setIsActing(false);
    }
  };

  // Helper function to get field options
  const getFieldOptions = (field) => {
    if (!field.options) return [];

    // If it's already an array, return it
    if (Array.isArray(field.options)) return field.options;

    // If it's a string, try to parse it
    if (typeof field.options === 'string') {
      try {
        const parsed = JSON.parse(field.options);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }

    // If it's an object (Prisma JsonValue), try to convert
    if (typeof field.options === 'object') {
      const keys = Object.keys(field.options);
      if (keys.every(k => !isNaN(k))) {
        return Object.values(field.options);
      }
    }

    return [];
  };

  const renderFieldValue = (field, value) => {
    if (!value && value !== 0 && value !== false) return '-';

    switch (field.type) {
      case 'FILE_UPLOAD':
      case 'MULTI_FILE':
        return <Badge variant="outline">File</Badge>;
      case 'BOOLEAN':
        return value ? 'Yes' : 'No';
      case 'DATE':
        try {
          return new Date(value).toLocaleDateString();
        } catch {
          return value;
        }
      case 'SELECT':
      case 'RADIO': {
        // For SELECT and RADIO, look up the label from options
        const options = getFieldOptions(field);
        const selectedOption = options.find(opt => opt.value === value);
        return selectedOption ? selectedOption.label : value;
      }
      case 'CHECKBOX': {
        // For CHECKBOX, value is an array of selected values
        const options = getFieldOptions(field);
        const selectedValues = Array.isArray(value) ? value : [value];
        const labels = selectedValues
          .map(val => {
            const option = options.find(opt => opt.value === val);
            return option ? option.label : val;
          })
          .filter(Boolean);
        return labels.length > 0 ? labels.join(', ') : value;
      }
      case 'TEXTAREA':
        return String(value).substring(0, 50) + (String(value).length > 50 ? '...' : '');
      default:
        if (typeof value === 'object') {
          return JSON.stringify(value).substring(0, 50);
        }
        return String(value).substring(0, 50);
    }
  };

  const getEvaluationInfo = (submission) => {
    if (!submission.evaluationProgress) return null;

    const progress = submission.evaluationProgress;

    return {
      scored: progress.scored || 0,
      total: progress.total || 0,
      averageScore: progress.averageScore,
      passed: progress.passed,
      status: progress.status,
      meetsCutoff: progress.meetsCutoff,
      meetsEvaluatorRequirement: progress.meetsEvaluatorRequirement,
      evaluatorPercentage: progress.evaluatorPercentage,
      cutoffScore: progress.cutoffScore
    };
  };

  const getFilteredSubmissions = () => {
    // Submissions are already filtered and paginated server-side
    return Array.isArray(submissions) ? submissions : [];
  };

  const pinnedFieldObjects = pinnedFields
    .map(id => formFields.find(f => f.id === id))
    .filter(Boolean);

  const filteredSubmissions = getFilteredSubmissions();

  if (isLoading) {
    return <div className="text-center py-8">Loading submissions...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Header Actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold">Submissions</h2>
          <Badge variant="outline">{filteredSubmissions.length} total</Badge>
          {selectedIds.length > 0 && (
            <Badge variant="default">{selectedIds.length} selected</Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={() => setIsConfigOpen(true)}
            variant="outline"
            size="sm"
          >
            <Settings className="h-4 w-4 mr-2" />
            Configure Columns
          </Button>
        </div>
      </div>

      {/* Filters and Actions */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Filter className="h-4 w-4 text-gray-500" />
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filter by step" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="step1">Step 1: Initial Review</SelectItem>
                <SelectItem value="step2">Step 2: Interview</SelectItem>
                <SelectItem value="all">All Steps</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortOrder} onValueChange={setSortOrder}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="date">Sort: Submission Date</SelectItem>
                <SelectItem value="score_desc">Sort: Highest Score</SelectItem>
                <SelectItem value="score_asc">Sort: Lowest Score</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            {selectedIds.length > 0 && (
              <>
                {evaluationData && evaluationData.length > 0 && (
                  <>
                    {canAdvance && (
                      <Button
                        onClick={handleAdvance}
                        disabled={isActing}
                        size="sm"
                        variant="default"
                      >
                        <ArrowRight className="h-4 w-4 mr-2" />
                        Advance Selected
                      </Button>
                    )}
                    {canAdmit && (
                      <Button
                        onClick={handleAdmit}
                        disabled={isActing}
                        size="sm"
                        className="bg-green-600 hover:bg-green-700"
                      >
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Admit Selected
                      </Button>
                    )}
                  </>
                )}
                <Button
                  onClick={handleReject}
                  disabled={isActing}
                  size="sm"
                  variant="destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Reject Selected
                </Button>
              </>
            )}
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b bg-gray-50">
              <tr>
                <th className="p-3 text-left w-12">
                  <Checkbox
                    checked={
                      selectedIds.length === filteredSubmissions.length &&
                      filteredSubmissions.length > 0
                    }
                    onCheckedChange={handleSelectAll}
                  />
                </th>
                <th className="p-3 text-left">Applicant</th>
                <th className="p-3 text-left">Status</th>
                <th className="p-3 text-left">Current Step</th>

                {/* Evaluation columns */}
                {evaluationData && evaluationData.length > 0 && (
                  <>
                    <th className="p-3 text-left">Average Score</th>
                    <th className="p-3 text-left">Evaluator Progress</th>
                    <th className="p-3 text-left">Pass/Fail</th>
                  </>
                )}

                {/* Pinned form fields */}
                {pinnedFieldObjects.map(field => (
                  <th key={field.id} className="p-3 text-left">
                    {field.label}
                  </th>
                ))}

                <th className="p-3 text-left">Submitted</th>
                <th className="p-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredSubmissions.length === 0 ? (
                <tr>
                  <td colSpan="100" className="p-8 text-center text-gray-500">
                    No submissions found
                  </td>
                </tr>
              ) : (
                filteredSubmissions.map(submission => {
                  const evalInfo = getEvaluationInfo(submission);
                  const isSelected = selectedIds.includes(submission.id);

                  return (
                    <tr
                      key={submission.id}
                      className={`border-b hover:bg-gray-50 ${isSelected ? 'bg-blue-50' : ''}`}
                    >
                      <td className="p-3">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedIds([...selectedIds, submission.id]);
                            } else {
                              setSelectedIds(selectedIds.filter(id => id !== submission.id));
                            }
                          }}
                        />
                      </td>
                      <td className="p-3">
                        <div className="font-medium">
                          {submission.applicantFirstName} {submission.applicantLastName}
                        </div>
                        <div className="text-sm text-gray-500">
                          {submission.applicantEmail}
                        </div>
                      </td>
                      <td className="p-3">
                        <Badge
                          variant={
                            submission.status === 'ACCEPTED'
                              ? 'default'
                              : submission.status === 'REJECTED'
                              ? 'destructive'
                              : 'outline'
                          }
                        >
                          {submission.status}
                        </Badge>
                      </td>

                      {/* Current Step */}
                      <td className="p-3">
                        <Badge variant="outline">
                          Step {submission.currentStep || 1}
                        </Badge>
                      </td>

                      {/* Evaluation Info */}
                      {evaluationData && evaluationData.length > 0 && (
                        <>
                          {/* Average Score */}
                          <td className="p-3">
                            {evalInfo?.averageScore !== null && evalInfo?.averageScore !== undefined ? (
                              <div className="flex items-center gap-1">
                                <span className="font-medium">{evalInfo.averageScore.toFixed(2)}</span>
                                <span className="text-xs text-gray-500">/ {evalSettings.maxScore || 10}</span>
                              </div>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>

                          {/* Evaluator Progress */}
                          <td className="p-3">
                            {evalInfo && evalInfo.total > 0 ? (
                              <div className="flex justify-center">
                                {(() => {
                                  const percentage = Math.round((evalInfo.scored / evalInfo.total) * 100);
                                  const strokeColor = percentage >= 75 ? '#16a34a' : percentage >= 50 ? '#f59e0b' : '#ef4444';
                                  const size = 48;
                                  const strokeWidth = 4;
                                  const radius = (size - strokeWidth) / 2;
                                  const circumference = radius * 2 * Math.PI;
                                  const offset = circumference - (percentage / 100) * circumference;

                                  return (
                                    <svg width={size} height={size} className="transform -rotate-90">
                                      {/* Background circle */}
                                      <circle
                                        cx={size / 2}
                                        cy={size / 2}
                                        r={radius}
                                        fill="none"
                                        stroke="#e5e7eb"
                                        strokeWidth={strokeWidth}
                                      />
                                      {/* Progress circle */}
                                      <circle
                                        cx={size / 2}
                                        cy={size / 2}
                                        r={radius}
                                        fill="none"
                                        stroke={strokeColor}
                                        strokeWidth={strokeWidth}
                                        strokeDasharray={circumference}
                                        strokeDashoffset={offset}
                                        strokeLinecap="round"
                                        style={{ transition: 'stroke-dashoffset 0.3s ease' }}
                                      />
                                      {/* Percentage text */}
                                      <text
                                        x="50%"
                                        y="50%"
                                        dominantBaseline="middle"
                                        textAnchor="middle"
                                        className="text-xs font-bold transform rotate-90"
                                        style={{ transform: 'rotate(90deg)', transformOrigin: 'center' }}
                                        fill={strokeColor}
                                      >
                                        {percentage}%
                                      </text>
                                    </svg>
                                  );
                                })()}
                              </div>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>

                          {/* Pass/Fail Status */}
                          <td className="p-3">
                            {evalInfo?.status ? (
                              evalInfo.status === 'PASSED' ? (
                                <div className="flex items-center gap-1">
                                  <CheckCircle className="h-4 w-4 text-green-600" />
                                  <span className="text-sm font-medium text-green-700">Passed</span>
                                </div>
                              ) : evalInfo.status === 'FAILED' ? (
                                <div className="flex items-center gap-1">
                                  <XCircle className="h-4 w-4 text-red-600" />
                                  <span className="text-sm font-medium text-red-700">Below Cutoff</span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1">
                                  <TrendingUp className="h-4 w-4 text-yellow-600" />
                                  <span className="text-sm font-medium text-yellow-700">Pending</span>
                                </div>
                              )
                            ) : (
                              <span className="text-gray-400 text-sm">Not scored</span>
                            )}
                          </td>
                        </>
                      )}

                      {/* Pinned Fields */}
                      {pinnedFieldObjects.map(field => (
                        <td key={field.id} className="p-3">
                          {renderFieldValue(field, submission.responses?.[field.id])}
                        </td>
                      ))}

                      <td className="p-3 text-sm text-gray-600">
                        {submission.submittedAt
                          ? new Date(submission.submittedAt).toLocaleDateString()
                          : '-'}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1">
                          <Button
                            onClick={() => {
                              const params = new URLSearchParams();
                              params.set('returnTab', 'submissions');
                              params.set('returnFilter', filter);
                              router.push(
                                `/applications/${applicationId}/submissions/${submission.id}?${params.toString()}`
                              );
                            }}
                            variant="ghost"
                            size="sm"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>

                          {/* Show appropriate action button if submission passed cutoff */}
                          {evalInfo?.status === 'PASSED' && submission.status !== 'ACCEPTED' && submission.status !== 'REJECTED' && (
                            <>
                              {/* Advance button for step 1 - move to step 2 */}
                              {submission.currentStep === 1 && canAdvance && (
                                <Button
                                  onClick={async () => {
                                    const currentStepData = evaluationData.find(s => s.stepNumber === 1);
                                    if (!currentStepData) return;

                                    setIsActing(true);
                                    try {
                                      const response = await fetch(
                                        `/api/applications/${applicationId}/evaluation/steps/${currentStepData.id}/advance`,
                                        {
                                          method: 'POST',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({ submissionIds: [submission.id] })
                                        }
                                      );
                                      if (!response.ok) throw new Error('Failed to advance');
                                      toast.success('Submission advanced to Step 2');
                                      loadData();
                                    } catch (error) {
                                      toast.error(error.message);
                                    } finally {
                                      setIsActing(false);
                                    }
                                  }}
                                  variant="default"
                                  size="sm"
                                  className="text-xs"
                                  disabled={isActing}
                                  title="Advance to Step 2"
                                >
                                  <ArrowRight className="h-3 w-3 mr-1" />
                                  Advance
                                </Button>
                              )}

                              {/* Admit button for step 2 - final admission */}
                              {submission.currentStep === 2 && canAdmit && (
                                <Button
                                  onClick={async () => {
                                    setIsActing(true);
                                    try {
                                      const response = await fetch(
                                        `/api/applications/${applicationId}/evaluation/admit`,
                                        {
                                          method: 'POST',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({ submissionIds: [submission.id] })
                                        }
                                      );
                                      if (!response.ok) throw new Error('Failed to admit');
                                      toast.success('Submission admitted to program');
                                      loadData();
                                    } catch (error) {
                                      toast.error(error.message);
                                    } finally {
                                      setIsActing(false);
                                    }
                                  }}
                                  className="bg-green-600 hover:bg-green-700 text-xs"
                                  size="sm"
                                  disabled={isActing}
                                  title="Admit to program"
                                >
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                  Admit
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="border-t px-4 py-3 flex items-center justify-between">
            <div className="text-sm text-gray-600">
              Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, totalSubmissions)} of {totalSubmissions} submissions
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(currentPage - 1)}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous
              </Button>
              <div className="text-sm text-gray-600">
                Page {currentPage} of {totalPages}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(currentPage + 1)}
                disabled={currentPage >= totalPages}
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Config Modal */}
      <SubmissionsTableConfig
        applicationId={applicationId}
        isOpen={isConfigOpen}
        onClose={() => setIsConfigOpen(false)}
        onConfigSaved={loadData}
      />
    </div>
  );
}
