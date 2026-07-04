import { useState, useEffect } from 'react';
import { useRoute } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import logoIcon from '@/assets/gridmart-logo-icon.png';
import logoText from '@/assets/gridmart-logo-text.png';

export default function Screening() {
  const [, params] = useRoute('/screening/:token');
  const token = params?.token;
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  
  const { data, isLoading, error } = useQuery({
    queryKey: ['screening-form', token],
    queryFn: async () => {
      const res = await fetch(`/api/screening/${token}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to load form');
      }
      return res.json();
    },
    enabled: !!token,
  });
  
  const submitMutation = useMutation({
    mutationFn: async () => {
      const responses = data.questions.map((q: any) => ({
        questionId: q.id,
        answer: answers[q.id] || '',
      }));
      
      const res = await fetch(`/api/screening/${token}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          responses,
          ...(data.isStandalone && { name, email }),
        }),
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to submit');
      }
      return res.json();
    },
    onSuccess: () => {
      setSubmitted(true);
    },
  });
  
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2">Unable to Load Form</h2>
            <p className="text-muted-foreground">{(error as Error).message}</p>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <CheckCircle className="w-12 h-12 text-primary mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2">Thank You!</h2>
            <p className="text-muted-foreground">
              Your responses have been submitted successfully. We'll review them and get back to you soon.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  const getAnswerData = (questionId: string) => {
    const ans = answers[questionId];
    if (!ans) return { option: null, elaboration: '' };
    try {
      const parsed = JSON.parse(ans);
      return { option: parsed.option || null, elaboration: parsed.elaboration || '' };
    } catch {
      return { option: ans, elaboration: '' };
    }
  };
  
  const requiredQuestions = data?.questions?.filter((q: any) => q.isRequired) || [];
  const allRequiredAnswered = requiredQuestions.every((q: any) => {
    const ans = answers[q.id];
    if (!ans?.trim()) return false;
    if (q.questionType === 'select' && q.elaborationOptions?.length) {
      try {
        const parsed = JSON.parse(ans);
        if (q.elaborationOptions.includes(parsed.option) && !parsed.elaboration?.trim()) {
          return false;
        }
      } catch { }
    }
    return true;
  });
  const standaloneValid = !data?.isStandalone || (name.trim() && email.trim());
  const canSubmit = allRequiredAnswered && standaloneValid;
  
  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-center gap-2 mb-8">
          <img src={logoIcon} alt="GridMart" className="h-10 w-10" />
          <img src={logoText} alt="GridMart" className="h-6" />
        </div>
        
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">
              {data?.isStandalone ? 'Application Screening' : 'Secondary Screening'}
            </CardTitle>
            <CardDescription>
              {data?.isStandalone 
                ? 'Please provide your information and answer the following questions.'
                : `Hi ${data?.applicantName}! Please answer the following questions to complete your application.`
              }
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {data?.isStandalone && (
              <div className="space-y-4 pb-4 border-b">
                <div className="space-y-2">
                  <Label>Your Name <span className="text-destructive">*</span></Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Full name"
                    data-testid="input-screening-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Your Email <span className="text-destructive">*</span></Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="email@example.com"
                    data-testid="input-screening-email"
                  />
                </div>
              </div>
            )}
            
            {data?.questions?.map((question: any, idx: number) => {
              const answerData = getAnswerData(question.id);
              const needsElaboration = question.elaborationOptions?.includes(answerData.option);
              
              return (
                <div key={question.id} className="space-y-2">
                  <Label className="text-sm font-medium flex items-start gap-2">
                    <span className="text-muted-foreground">{idx + 1}.</span>
                    <span>
                      {question.question}
                      {question.isRequired && <span className="text-destructive ml-1">*</span>}
                    </span>
                  </Label>
                  
                  {question.questionType === 'select' && question.options ? (
                    <div className="space-y-2">
                      <div className="space-y-1">
                        {question.options.map((opt: string, optIdx: number) => (
                          <label key={optIdx} className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-muted/50">
                            <input
                              type="radio"
                              name={`question-${question.id}`}
                              value={opt}
                              checked={answerData.option === opt}
                              onChange={(e) => {
                                const needsElab = question.elaborationOptions?.includes(e.target.value);
                                setAnswers(prev => ({ 
                                  ...prev, 
                                  [question.id]: JSON.stringify({ 
                                    option: e.target.value, 
                                    elaboration: needsElab ? '' : undefined 
                                  })
                                }));
                              }}
                              className="w-4 h-4 text-primary"
                              data-testid={`radio-option-${question.id}-${optIdx}`}
                            />
                            <span>{opt}</span>
                            {question.elaborationOptions?.includes(opt) && (
                              <span className="text-xs text-muted-foreground">(requires details)</span>
                            )}
                          </label>
                        ))}
                      </div>
                      {needsElaboration && (
                        <div className="pl-6 space-y-1">
                          <Label className="text-xs text-muted-foreground">Please elaborate: <span className="text-destructive">*</span></Label>
                          <Textarea
                            value={answerData.elaboration}
                            onChange={(e) => {
                              setAnswers(prev => ({ 
                                ...prev, 
                                [question.id]: JSON.stringify({ 
                                  option: answerData.option, 
                                  elaboration: e.target.value 
                                })
                              }));
                            }}
                            placeholder="Please provide more details..."
                            className="min-h-[60px]"
                            data-testid={`textarea-elaboration-${question.id}`}
                          />
                        </div>
                      )}
                    </div>
                  ) : question.questionType === 'boolean' ? (
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name={`question-${question.id}`}
                          value="Yes"
                          checked={answers[question.id] === 'Yes'}
                          onChange={(e) => setAnswers(prev => ({ ...prev, [question.id]: e.target.value }))}
                          className="w-4 h-4 text-primary"
                          data-testid={`radio-yes-${question.id}`}
                        />
                        <span>Yes</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name={`question-${question.id}`}
                          value="No"
                          checked={answers[question.id] === 'No'}
                          onChange={(e) => setAnswers(prev => ({ ...prev, [question.id]: e.target.value }))}
                          className="w-4 h-4 text-primary"
                          data-testid={`radio-no-${question.id}`}
                        />
                        <span>No</span>
                      </label>
                    </div>
                  ) : (
                    <Textarea
                      value={answers[question.id] || ''}
                      onChange={(e) => setAnswers(prev => ({ ...prev, [question.id]: e.target.value }))}
                      placeholder="Your answer..."
                      className={question.questionType === 'text' ? 'min-h-[60px]' : 'min-h-[100px]'}
                      data-testid={`textarea-answer-${question.id}`}
                    />
                  )}
                </div>
              );
            })}
            
            <div className="pt-4">
              <Button
                className="w-full"
                size="lg"
                onClick={() => submitMutation.mutate()}
                disabled={!canSubmit || submitMutation.isPending}
                data-testid="button-submit-screening"
              >
                {submitMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  'Submit Responses'
                )}
              </Button>
              
              {submitMutation.error && (
                <p className="text-destructive text-sm mt-2 text-center">
                  {(submitMutation.error as Error).message}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
