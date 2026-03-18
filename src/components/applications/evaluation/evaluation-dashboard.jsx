'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { AlertCircle, CheckCircle, Settings, Users, Calendar } from 'lucide-react';
import StepSetup from './step-setup';
import InterviewSlots from './interview-slots';

export default function EvaluationDashboard({ applicationId }) {
  const [steps, setSteps] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasSetup, setHasSetup] = useState(false);
  const [activeStepTab, setActiveStepTab] = useState('step1');

  useEffect(() => {
    loadSteps();
  }, [applicationId]);

  const loadSteps = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/applications/${applicationId}/evaluation/steps`);
      const data = await response.json();

      if (response.ok && data.data && data.data.length > 0) {
        setSteps(data.data);
        setHasSetup(true);
      } else {
        setHasSetup(false);
      }
    } catch (error) {
      console.error('Error loading evaluation steps:', error);
      toast.error('Failed to load evaluation configuration');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetupComplete = () => {
    toast.success('Evaluation pipeline configured successfully');
    loadSteps();
  };

  const getStepBadge = (step) => {
    if (step.isActive) {
      return <Badge className="bg-green-500">Active</Badge>;
    }
    return <Badge variant="outline">Inactive</Badge>;
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-8">
          <div className="flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin h-8 w-8 border-4 border-purple-500 border-t-transparent rounded-full mx-auto mb-4"></div>
              <p className="text-slate-gray-600">Loading evaluation configuration...</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show setup form if no steps configured
  if (!hasSetup) {
    return (
      <div className="space-y-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Evaluation pipeline not configured. Set up your evaluation steps to start reviewing submissions.
          </AlertDescription>
        </Alert>

        <StepSetup applicationId={applicationId} onSetupComplete={handleSetupComplete} />
      </div>
    );
  }

  // Show evaluation dashboard if steps are configured
  const step1 = steps.find(s => s.stepNumber === 1);
  const step2 = steps.find(s => s.stepNumber === 2);

  return (
    <div className="space-y-6">
      {/* Pipeline Status Overview */}
      <Card className="starboard-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Evaluation Pipeline</CardTitle>
              <CardDescription>
                2-step evaluation process with {step1?.criteria?.length || 0} + {step2?.criteria?.length || 0} criteria
              </CardDescription>
            </div>
            <Button variant="outline" size="sm">
              <Settings className="w-4 h-4 mr-2" />
              Configure
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Step 1 Card */}
            <Card className="border-2">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Step 1: {step1?.name}</CardTitle>
                  {getStepBadge(step1)}
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-gray-600">Type:</span>
                    <Badge variant="outline">{step1?.type}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-gray-600">Criteria:</span>
                    <span className="font-medium">{step1?.criteria?.length || 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-gray-600">Scores Submitted:</span>
                    <span className="font-medium">{step1?._count?.scores || 0}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Step 2 Card */}
            <Card className="border-2">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Step 2: {step2?.name}</CardTitle>
                  {getStepBadge(step2)}
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-gray-600">Type:</span>
                    <Badge variant="outline">{step2?.type}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-gray-600">Criteria:</span>
                    <span className="font-medium">{step2?.criteria?.length || 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-gray-600">Slots Created:</span>
                    <span className="font-medium">{step2?._count?.interviewSlots || 0}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>

      {/* Step Tabs */}
      <Tabs value={activeStepTab} onValueChange={setActiveStepTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="step1">
            <Users className="w-4 h-4 mr-2" />
            Step 1: {step1?.name}
          </TabsTrigger>
          <TabsTrigger value="step2">
            <Calendar className="w-4 h-4 mr-2" />
            Step 2: {step2?.name}
          </TabsTrigger>
        </TabsList>

        {/* Step 1 Content */}
        <TabsContent value="step1" className="space-y-4">
          {step1 && (
            <Card className="starboard-card">
              <CardHeader>
                <CardTitle>Evaluation Criteria</CardTitle>
                <CardDescription>Scoring criteria for {step1.name}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {step1.criteria?.map((criterion, index) => (
                    <div
                      key={criterion.id}
                      className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-purple-100 text-purple-700 font-semibold text-sm">
                          {index + 1}
                        </div>
                        <span className="font-medium">{criterion.name}</span>
                      </div>
                      <Badge variant="outline">Weight: {criterion.weight}x</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Step 2 Content */}
        <TabsContent value="step2" className="space-y-4">
          {step2 && (
            <>
              <Card className="starboard-card">
                <CardHeader>
                  <CardTitle>Evaluation Criteria</CardTitle>
                  <CardDescription>Scoring criteria for {step2.name}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {step2.criteria?.map((criterion, index) => (
                      <div
                        key={criterion.id}
                        className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-purple-100 text-purple-700 font-semibold text-sm">
                            {index + 1}
                          </div>
                          <span className="font-medium">{criterion.name}</span>
                        </div>
                        <Badge variant="outline">Weight: {criterion.weight}x</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
              <InterviewSlots applicationId={applicationId} stepId={step2.id} />
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
