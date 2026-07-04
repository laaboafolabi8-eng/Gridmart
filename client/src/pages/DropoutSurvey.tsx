import { useState, useEffect } from 'react';
import { useParams } from 'wouter';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { CheckCircle, Loader2, AlertCircle } from 'lucide-react';
import logoIcon from '@/assets/gridmart-logo-icon.png';

interface SurveyOption {
  id: string;
  label: string;
  sortOrder: number;
}

interface SurveyData {
  id: string;
  title: string;
  description: string | null;
  allowMultiple: boolean;
}

export default function DropoutSurvey() {
  const params = useParams<{ id: string }>();
  const surveyId = params.id;

  const [survey, setSurvey] = useState<SurveyData | null>(null);
  const [options, setOptions] = useState<SurveyOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [selectedReasons, setSelectedReasons] = useState<string[]>([]);
  const [otherChecked, setOtherChecked] = useState(false);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!surveyId) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    fetch(`/api/surveys/${surveyId}/public`)
      .then(r => {
        if (!r.ok) throw new Error('Not found');
        return r.json();
      })
      .then(data => {
        setSurvey(data.survey);
        setOptions(data.options || []);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [surveyId]);

  const allowMultiple = survey?.allowMultiple !== false;

  const toggleReason = (reason: string) => {
    if (allowMultiple) {
      setSelectedReasons(prev =>
        prev.includes(reason) ? prev.filter(r => r !== reason) : [...prev, reason]
      );
    } else {
      setSelectedReasons([reason]);
      setOtherChecked(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const reasons = [...selectedReasons];
    if (otherChecked && comment.trim()) {
      reasons.push(`Other: ${comment.trim()}`);
    } else if (otherChecked) {
      reasons.push("Other");
    }

    if (reasons.length === 0) {
      toast.error('Please select at least one reason');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/surveys/${surveyId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reasons, comment: comment.trim() || null }),
      });
      if (!res.ok) throw new Error('Failed to submit');
      setSubmitted(true);
    } catch {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/20 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-8 pb-8 text-center">
            <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Survey Not Found</h2>
            <p className="text-muted-foreground">
              This survey may no longer be available.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/20 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-8 pb-8 text-center">
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Thank you for your feedback</h2>
            <p className="text-muted-foreground">
              Your response helps us improve. We appreciate your time.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/20 p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <img src={logoIcon} alt="GridMart" className="w-8 h-8" />
            <span className="font-display text-xl font-bold text-gradient">GridMart</span>
          </div>
          <CardTitle className="text-lg">{survey?.title || 'Survey'}</CardTitle>
          {survey?.description && (
            <CardDescription>{survey.description}</CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-3">
              {allowMultiple ? (
                <>
                  {options.map((opt) => (
                    <label
                      key={opt.id}
                      className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors"
                      data-testid={`checkbox-reason-${opt.id}`}
                    >
                      <Checkbox
                        checked={selectedReasons.includes(opt.label)}
                        onCheckedChange={() => toggleReason(opt.label)}
                      />
                      <span className="text-sm">{opt.label}</span>
                    </label>
                  ))}
                </>
              ) : (
                <RadioGroup
                  value={selectedReasons[0] || ''}
                  onValueChange={(val) => { setSelectedReasons([val]); setOtherChecked(false); }}
                >
                  {options.map((opt) => (
                    <label
                      key={opt.id}
                      className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors"
                      data-testid={`radio-reason-${opt.id}`}
                    >
                      <RadioGroupItem value={opt.label} />
                      <span className="text-sm">{opt.label}</span>
                    </label>
                  ))}
                </RadioGroup>
              )}
              <label
                className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors"
                data-testid="checkbox-reason-other"
              >
                <Checkbox
                  checked={otherChecked}
                  onCheckedChange={(checked) => {
                    setOtherChecked(!!checked);
                    if (!allowMultiple && checked) {
                      setSelectedReasons([]);
                    }
                  }}
                />
                <span className="text-sm">Other</span>
              </label>
            </div>

            {otherChecked && (
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Feel free to share any details (optional)"
                rows={3}
                data-testid="input-survey-comment"
              />
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={submitting}
              data-testid="button-submit-survey"
            >
              {submitting ? 'Submitting...' : 'Submit Feedback'}
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              Your response is anonymous and helps us improve.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
