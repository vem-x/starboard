'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { ChevronDown, ChevronUp, Eye, Users, AlertCircle, ArrowUpDown } from 'lucide-react';

export default function ImprovedAdminScoreboard({ applicationId, stepId, stepNumber, stepName, onAction }) {
  const [scoreboard, setScoreboard] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [isActing, setIsActing] = useState(false);
  const [sortOrder, setSortOrder] = useState('date'); // 'date' | 'score_desc' | 'score_asc'

  useEffect(() => {
    loadScoreboard();
  }, [stepId]);

  const loadScoreboard = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/applications/${applicationId}/evaluation/steps/${stepId}/scoreboard`
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || 'Failed to load scoreboard');
      }

      setScoreboard(data.data || []);
    } catch (error) {
      console.error('Error loading scoreboard:', error);
      toast.error(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleRow = (submissionId) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(submissionId)) {
      newExpanded.delete(submissionId);
    } else {
      newExpanded.add(submissionId);
    }
    setExpandedRows(newExpanded);
  };

  const handleSelectAll = (checked) => {
    if (checked) {
      // Only select valid submissions
      const validIds = scoreboard
        .filter(s => s.isValid !== false)
        .map(s => s.submissionId);
      setSelectedIds(validIds);
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
      const response = await fetch(
        `/api/applications/${applicationId}/evaluation/steps/${stepId}/advance`,
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

      toast.success(`Advanced ${data.data.count} submissions to Step 2`);
      setSelectedIds([]);
      loadScoreboard();
      onAction?.();
    } catch (error) {
      console.error('Error advancing submissions:', error);
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
      loadScoreboard();
      onAction?.();
    } catch (error) {
      console.error('Error admitting submissions:', error);
      toast.error(error.message);
    } finally {
      setIsActing(false);
    }
  };

  if (isLoading) {
    return <div className="text-center py-8">Loading scoreboard...</div>;
  }

  const validSubmissions = scoreboard.filter(s => s.isValid !== false).length;
  const invalidSubmissions = scoreboard.filter(s => s.isValid === false).length;

  const sortedScoreboard = [...scoreboard].sort((a, b) => {
    if (sortOrder === 'score_desc') return (b.averageScore ?? -1) - (a.averageScore ?? -1);
    if (sortOrder === 'score_asc') return (a.averageScore ?? -1) - (b.averageScore ?? -1);
    return 0; // 'date' — preserve server order (submittedAt asc)
  });

  return (
    <div className="space-y-4">
      {/* Info + Sort Filter */}
      <div className="flex justify-between items-center">
        <div className="text-sm text-gray-600">
          {stepName} {selectedIds.length > 0 && `• ${selectedIds.length} selected`}
        </div>
        <div className="flex items-center gap-2">
          <ArrowUpDown className="h-4 w-4 text-gray-400" />
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            className="text-sm border rounded px-2 py-1 bg-white"
          >
            <option value="date">Sort: Submission Date</option>
            <option value="score_desc">Sort: Highest Score</option>
            <option value="score_asc">Sort: Lowest Score</option>
          </select>
        </div>
      </div>

      {/* Enhanced Scoreboard Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b bg-gray-50">
              <tr>
                <th className="p-3 text-left w-12">
                  <Checkbox
                    checked={selectedIds.length === validSubmissions && validSubmissions > 0}
                    onCheckedChange={handleSelectAll}
                  />
                </th>
                <th className="p-3 text-left w-12"></th>
                <th className="p-3 text-left">Applicant</th>
                <th className="p-3 text-left">Company/Startup</th>
                <th className="p-3 text-left">Average Score</th>
                <th className="p-3 text-left">Evaluators</th>
                <th className="p-3 text-left">Status</th>
                <th className="p-3 text-left">Submitted</th>
              </tr>
            </thead>
            <tbody>
              {scoreboard.length === 0 ? (
                <tr>
                  <td colSpan="8" className="p-8 text-center text-gray-500">
                    No submissions found for this step
                  </td>
                </tr>
              ) : (
                sortedScoreboard.map((submission) => (
                  <>
                    {/* Main Row */}
                    <tr key={submission.submissionId} className="border-b hover:bg-gray-50">
                      <td className="p-3">
                        <Checkbox
                          checked={selectedIds.includes(submission.submissionId)}
                          disabled={submission.isValid === false}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedIds([...selectedIds, submission.submissionId]);
                            } else {
                              setSelectedIds(selectedIds.filter(id => id !== submission.submissionId));
                            }
                          }}
                        />
                      </td>
                      <td className="p-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleRow(submission.submissionId)}
                        >
                          {expandedRows.has(submission.submissionId) ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </Button>
                      </td>
                      <td className="p-3">
                        <div className="font-medium">{submission.applicantName}</div>
                        <div className="text-sm text-gray-500">{submission.applicantEmail}</div>
                      </td>
                      <td className="p-3">
                        {submission.companyName || '-'}
                      </td>
                      <td className="p-3">
                        {submission.isValid === false ? (
                          <div className="flex items-center gap-2">
                            <Badge variant="destructive" className="flex items-center gap-1">
                              <AlertCircle className="h-3 w-3" />
                              Invalid
                            </Badge>
                            <span className="text-xs text-red-600">
                              {submission.validityMessage}
                            </span>
                          </div>
                        ) : submission.averageScore !== null ? (
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={submission.averageScore >= 7 ? 'default' : 'secondary'}
                              className={submission.averageScore >= 7 ? 'bg-green-600' : ''}
                            >
                              {submission.averageScore.toFixed(2)}
                            </Badge>
                            <span className="text-xs text-gray-500">
                              / 10.00
                            </span>
                          </div>
                        ) : (
                          <Badge variant="outline">Not scored</Badge>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-gray-400" />
                          <span className="font-medium">
                            {submission.evaluatorCount}/{submission.totalJudges || '?'}
                          </span>
                          {submission.evaluatorCount > 0 && (
                            <Badge variant="outline" className="text-xs">
                              {Math.round((submission.evaluatorCount / (submission.totalJudges || 1)) * 100)}%
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="p-3">
                        <Badge variant="outline">Step {submission.currentStep}</Badge>
                      </td>
                      <td className="p-3 text-sm text-gray-600">
                        {submission.submittedAt
                          ? new Date(submission.submittedAt).toLocaleDateString()
                          : '-'}
                      </td>
                    </tr>

                    {/* Expanded Details Row */}
                    {expandedRows.has(submission.submissionId) && (
                      <tr className="bg-gray-50">
                        <td colSpan="8" className="p-4">
                          <div className="space-y-3">
                            <h4 className="font-semibold text-sm flex items-center gap-2">
                              <Eye className="h-4 w-4" />
                              Individual Evaluator Scores
                            </h4>

                            {submission.evaluators && submission.evaluators.length > 0 ? (
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                {submission.evaluators.map((evaluator, idx) => (
                                  <Card key={idx} className="p-3 bg-white">
                                    <div className="flex justify-between items-center">
                                      <div>
                                        <p className="font-medium text-sm">{evaluator.name}</p>
                                        <p className="text-xs text-gray-500">Evaluator</p>
                                      </div>
                                      <Badge variant="outline" className="text-lg font-bold">
                                        {evaluator.score.toFixed(2)}
                                      </Badge>
                                    </div>
                                  </Card>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-gray-500 italic">
                                No evaluators have scored this submission yet
                              </p>
                            )}

                            {/* Show who hasn't scored */}
                            {submission.totalJudges > submission.evaluatorCount && (
                              <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded">
                                <p className="text-sm text-yellow-800 flex items-center gap-2">
                                  <AlertCircle className="h-4 w-4" />
                                  Waiting for {submission.totalJudges - submission.evaluatorCount} more evaluator(s) to score
                                </p>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
