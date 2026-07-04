import { useState, useEffect, useCallback } from 'react';
import { Link } from 'wouter';
import { MapPin, Check, ArrowLeft, Loader2, AlertCircle, ShieldCheck } from 'lucide-react';
import { useNodeApplicationConfig } from '@/hooks/useNodeApplicationConfig';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import logoIcon from '@/assets/gridmart-logo-icon.png';

interface ScreeningQuestion {
  id: string;
  question: string;
  questionType: string;
  options: string[] | null;
  hasOtherOption: boolean;
  isRequired: boolean;
  sortOrder: number;
  fieldKey: string | null;
}

export default function NodeApplication() {
  const { config } = useNodeApplicationConfig();
  const [submitted, setSubmitted] = useState(false);
  const [questions, setQuestions] = useState<ScreeningQuestion[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(true);
  const [questionsError, setQuestionsError] = useState(false);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [otherValues, setOtherValues] = useState<Record<string, string>>({});
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [captchaChecked, setCaptchaChecked] = useState(false);
  const [captchaVerifying, setCaptchaVerifying] = useState(false);
  const [captchaChallenge, setCaptchaChallenge] = useState<{ a: number; b: number; answer: number } | null>(null);
  const [captchaInput, setCaptchaInput] = useState('');
  const [captchaError, setCaptchaError] = useState(false);
  const [honeypot, setHoneypot] = useState('');

  const generateChallenge = useCallback(() => {
    const a = Math.floor(Math.random() * 10) + 1;
    const b = Math.floor(Math.random() * 10) + 1;
    return { a, b, answer: a + b };
  }, []);

  const handleCaptchaClick = useCallback(() => {
    if (captchaChecked || captchaVerifying) return;
    setCaptchaVerifying(true);
    setCaptchaError(false);
    setTimeout(() => {
      if (Math.random() > 0.3) {
        setCaptchaVerifying(false);
        setCaptchaChecked(true);
      } else {
        setCaptchaVerifying(false);
        setCaptchaChallenge(generateChallenge());
      }
    }, 1500);
  }, [captchaChecked, captchaVerifying, generateChallenge]);

  const handleChallengeSubmit = useCallback(() => {
    if (!captchaChallenge) return;
    if (parseInt(captchaInput) === captchaChallenge.answer) {
      setCaptchaChallenge(null);
      setCaptchaChecked(true);
      setCaptchaInput('');
      setCaptchaError(false);
    } else {
      setCaptchaError(true);
      setCaptchaInput('');
      setCaptchaChallenge(generateChallenge());
    }
  }, [captchaChallenge, captchaInput, generateChallenge]);

  useEffect(() => {
    fetch('/api/primary-screening-questions/active')
      .then(res => {
        if (!res.ok) throw new Error('Failed to load');
        return res.json();
      })
      .then(data => {
        setQuestions(data);
        const initialAnswers: Record<string, any> = {};
        data.forEach((q: ScreeningQuestion) => {
          if (q.questionType === 'checkbox' || q.questionType === 'confirmation') {
            initialAnswers[q.id] = [];
          } else {
            initialAnswers[q.id] = '';
          }
        });
        setAnswers(initialAnswers);
      })
      .catch(() => setQuestionsError(true))
      .finally(() => setQuestionsLoading(false));
  }, []);

  const setAnswer = (questionId: string, value: any) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
  };

  const toggleCheckbox = (questionId: string, option: string) => {
    setAnswers(prev => {
      const current = prev[questionId] || [];
      if (current.includes(option)) {
        return { ...prev, [questionId]: current.filter((o: string) => o !== option) };
      }
      return { ...prev, [questionId]: [...current, option] };
    });
  };

  const allConfirmationsChecked = () => {
    return questions
      .filter(q => q.questionType === 'confirmation')
      .every(q => {
        const checked = answers[q.id] || [];
        return q.options && checked.length === q.options.length;
      });
  };

  const allRequiredAnswered = () => {
    return questions
      .filter(q => q.isRequired && q.questionType !== 'confirmation')
      .every(q => {
        const val = answers[q.id];
        if (q.questionType === 'checkbox') {
          return Array.isArray(val) && val.length > 0;
        }
        return val && val !== '';
      });
  };

  const getResolvedAnswer = (q: ScreeningQuestion): string => {
    let answer = answers[q.id];
    if ((q.questionType === 'checkbox' || q.questionType === 'radio') && q.hasOtherOption) {
      const otherVal = otherValues[q.id];
      if (q.questionType === 'checkbox' && Array.isArray(answer) && answer.includes('__other__') && otherVal) {
        answer = answer.map((a: string) => a === '__other__' ? `Other: ${otherVal}` : a);
      } else if (q.questionType === 'radio' && answer === '__other__' && otherVal) {
        answer = `Other: ${otherVal}`;
      }
    }
    if (Array.isArray(answer)) return answer.join(', ');
    return answer || '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');
    setIsSubmitting(true);

    if (honeypot) {
      setSubmitted(true);
      return;
    }

    try {
      const screeningAnswers = questions.map(q => ({
        questionId: q.id,
        question: q.question,
        answer: getResolvedAnswer(q),
        fieldKey: q.fieldKey || null,
      }));

      const getByFieldKey = (key: string): string => {
        const found = screeningAnswers.find(a => a.fieldKey === key);
        return found?.answer || '';
      };

      const response = await fetch('/api/node-applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          phone: '',
          cityNeighborhood: getByFieldKey('cityNeighborhood') || 'See screening answers',
          nodeType: getByFieldKey('nodeType') || 'See screening answers',
          availabilityWindow: getByFieldKey('availabilityWindow') || 'See screening answers',
          storageSize: getByFieldKey('storageSize') || 'See screening answers',
          lateAvailability7pm: false,
          lateAvailability9pm: false,
          prepaidAgreement: true,
          canStoreCrate: getByFieldKey('canStoreCrate') || null,
          comfortableMeetingOutside: getByFieldKey('comfortableMeetingOutside') || null,
          comfortableAdjustingAvailability: getByFieldKey('comfortableAdjustingAvailability') || null,
          canPauseHandoffs: getByFieldKey('canPauseHandoffs') || null,
          additionalNotes: additionalNotes || null,
          screeningAnswers,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to submit application');
      }

      setSubmitted(true);
    } catch (err: any) {
      console.error('Failed to submit application:', err);
      setSubmitError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderQuestion = (q: ScreeningQuestion) => {
    switch (q.questionType) {
      case 'text':
        return (
          <Input
            value={answers[q.id] || ''}
            onChange={(e) => setAnswer(q.id, e.target.value)}
            className="bg-white/20 border-white/30 text-white placeholder:text-teal-200"
            placeholder="Your answer"
            required={q.isRequired}
            data-testid={`input-primary-${q.id}`}
          />
        );

      case 'textarea':
        return (
          <Textarea
            value={answers[q.id] || ''}
            onChange={(e) => setAnswer(q.id, e.target.value)}
            className="bg-white/20 border-white/30 text-white placeholder:text-teal-200"
            placeholder="Your answer"
            rows={3}
            data-testid={`textarea-primary-${q.id}`}
          />
        );

      case 'radio':
        return (
          <RadioGroup
            value={answers[q.id] || ''}
            onValueChange={(v) => setAnswer(q.id, v)}
            className="space-y-2"
          >
            {q.options?.map((opt) => (
              <div key={opt} className="flex items-center gap-2">
                <RadioGroupItem value={opt} id={`${q.id}-${opt}`} className="border-white text-white" />
                <Label htmlFor={`${q.id}-${opt}`} className="text-white cursor-pointer">{opt}</Label>
              </div>
            ))}
            {q.hasOtherOption && (
              <div className="flex items-center gap-2">
                <RadioGroupItem value="__other__" id={`${q.id}-other`} className="border-white text-white" />
                <Label htmlFor={`${q.id}-other`} className="text-white cursor-pointer">Other:</Label>
                {answers[q.id] === '__other__' && (
                  <Input
                    value={otherValues[q.id] || ''}
                    onChange={(e) => setOtherValues(prev => ({ ...prev, [q.id]: e.target.value }))}
                    className="bg-white/20 border-white/30 text-white placeholder:text-teal-200 flex-1"
                    placeholder="Specify..."
                  />
                )}
              </div>
            )}
          </RadioGroup>
        );

      case 'checkbox':
        return (
          <div className="space-y-2">
            {q.options?.map((opt) => (
              <div key={opt} className="flex items-start gap-2">
                <Checkbox
                  id={`${q.id}-${opt}`}
                  checked={(answers[q.id] || []).includes(opt)}
                  onCheckedChange={() => toggleCheckbox(q.id, opt)}
                  className="border-white data-[state=checked]:bg-white data-[state=checked]:text-teal-600 mt-0.5 shrink-0"
                />
                <Label htmlFor={`${q.id}-${opt}`} className="text-white cursor-pointer text-sm">{opt}</Label>
              </div>
            ))}
            {q.hasOtherOption && (
              <div className="flex items-start gap-2">
                <Checkbox
                  id={`${q.id}-other`}
                  checked={(answers[q.id] || []).includes('__other__')}
                  onCheckedChange={() => toggleCheckbox(q.id, '__other__')}
                  className="border-white data-[state=checked]:bg-white data-[state=checked]:text-teal-600 mt-0.5 shrink-0"
                />
                <Label htmlFor={`${q.id}-other`} className="text-white cursor-pointer text-sm">Other:</Label>
                {(answers[q.id] || []).includes('__other__') && (
                  <Input
                    value={otherValues[q.id] || ''}
                    onChange={(e) => setOtherValues(prev => ({ ...prev, [q.id]: e.target.value }))}
                    className="bg-white/20 border-white/30 text-white placeholder:text-teal-200 flex-1"
                    placeholder="Specify..."
                  />
                )}
              </div>
            )}
          </div>
        );

      case 'confirmation':
        return (
          <div className="space-y-3">
            {q.options?.map((opt) => (
              <div key={opt} className="flex items-start gap-2">
                <Checkbox
                  id={`${q.id}-${opt}`}
                  checked={(answers[q.id] || []).includes(opt)}
                  onCheckedChange={() => toggleCheckbox(q.id, opt)}
                  className="border-white data-[state=checked]:bg-white data-[state=checked]:text-teal-600 mt-0.5 shrink-0"
                />
                <Label htmlFor={`${q.id}-${opt}`} className="text-white cursor-pointer text-sm">{opt}</Label>
              </div>
            ))}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-teal-500 via-teal-600 to-teal-700">
      <Header />

      <main className="flex-1 flex items-center justify-center p-4 py-8">
        <div className="max-w-lg w-full">
          <div className="text-center text-white mb-6">
            <div className="w-20 h-20 bg-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xl">
              <img src={logoIcon} alt="GridMart" className="w-14 h-14" />
            </div>
            <h1 className="text-3xl font-bold mb-2">{config.heroTitle}</h1>
            <p className="text-teal-100">{config.heroSubtitle}</p>
          </div>

          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 max-h-[70vh] overflow-y-auto">
            {submitted ? (
              <div className="text-center py-4 text-white">
                <Check className="w-12 h-12 mx-auto mb-4" />
                <h3 className="text-xl font-semibold mb-2">{config.successTitle}</h3>
                <p className="text-teal-100 mb-4">{config.successMessage}</p>
                <Link href="/">
                  <Button className="bg-white text-teal-600 hover:bg-teal-50">
                    Back to Home
                  </Button>
                </Link>
              </div>
            ) : questionsLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-8 h-8 text-white animate-spin" />
              </div>
            ) : questionsError ? (
              <div className="text-center py-8 text-white">
                <AlertCircle className="w-10 h-10 mx-auto mb-3 text-red-200" />
                <p className="text-lg font-semibold mb-2">Unable to load application form</p>
                <p className="text-teal-100 text-sm mb-4">Please try again later or contact us for assistance.</p>
                <Button onClick={() => window.location.reload()} className="bg-white text-teal-600 hover:bg-teal-50">
                  Try Again
                </Button>
              </div>
            ) : (
              <>
                <div className="bg-white/10 rounded-lg p-4 mb-6 text-left text-white">
                  <h4 className="font-semibold mb-3">{config.aboutTitle}</h4>
                  <div className="space-y-3 text-sm text-teal-100">
                    {config.aboutText.split('\n\n').map((paragraph, idx) => (
                      <p key={idx}>{paragraph}</p>
                    ))}
                  </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-8 text-left">
                  <div>
                    <Label className="text-white text-base font-medium">Full Name <span className="text-red-200">*</span></Label>
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="bg-white/20 border-white/30 text-white placeholder:text-teal-200"
                      placeholder="Your name"
                      required
                      data-testid="input-node-name"
                    />
                  </div>

                  <div>
                    <Label className="text-white text-base font-medium">Email <span className="text-red-200">*</span></Label>
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="bg-white/20 border-white/30 text-white placeholder:text-teal-200"
                      placeholder="Your email"
                      required
                      data-testid="input-node-email"
                    />
                  </div>

                  {questions.map((q) => (
                    <div key={q.id}>
                      <Label className="text-white text-base font-medium mb-3 block">
                        {q.question}
                        {q.isRequired && <span className="text-red-200 ml-1">*</span>}
                      </Label>
                      {renderQuestion(q)}
                    </div>
                  ))}

                  <div>
                    <Label className="text-white text-base font-medium">Any additional notes or questions?</Label>
                    <Textarea
                      value={additionalNotes}
                      onChange={(e) => setAdditionalNotes(e.target.value)}
                      className="bg-white/20 border-white/30 text-white placeholder:text-teal-200"
                      placeholder="Long answer text"
                      rows={3}
                      data-testid="input-node-notes"
                    />
                  </div>

                  <div style={{ position: 'absolute', left: '-9999px', opacity: 0, height: 0, overflow: 'hidden' }} aria-hidden="true" tabIndex={-1}>
                    <label htmlFor="website_url">Website</label>
                    <input
                      type="text"
                      id="website_url"
                      name="website_url"
                      value={honeypot}
                      onChange={(e) => setHoneypot(e.target.value)}
                      autoComplete="off"
                      tabIndex={-1}
                    />
                  </div>

                  <div
                    className="bg-[#f9f9f9] border-2 border-[#d3d3d3] rounded-[3px] shadow-sm overflow-hidden"
                    data-testid="captcha-widget"
                  >
                    <div className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div
                          onClick={handleCaptchaClick}
                          className={`w-7 h-7 border-2 rounded-sm cursor-pointer flex items-center justify-center transition-all ${
                            captchaChecked
                              ? 'bg-[#4caf50] border-[#4caf50]'
                              : captchaVerifying
                              ? 'border-[#bbb] bg-white'
                              : 'border-[#c1c1c1] bg-white hover:border-[#888]'
                          }`}
                          data-testid="checkbox-captcha"
                        >
                          {captchaVerifying && (
                            <Loader2 className="w-5 h-5 text-[#4285f4] animate-spin" />
                          )}
                          {captchaChecked && (
                            <Check className="w-5 h-5 text-white" strokeWidth={3} />
                          )}
                        </div>
                        <span className="text-[#555] text-sm font-normal select-none">
                          I'm not a robot
                        </span>
                      </div>
                      <div className="flex flex-col items-center gap-0.5">
                        <ShieldCheck className="w-7 h-7 text-[#555]" />
                        <span className="text-[9px] text-[#555] leading-tight">GridMart</span>
                        <span className="text-[8px] text-[#999] leading-tight">Security</span>
                      </div>
                    </div>

                    {captchaChallenge && !captchaChecked && (
                      <div className="border-t border-[#d3d3d3] bg-white px-4 py-3">
                        <p className="text-[#333] text-sm mb-2 font-medium">
                          Solve this to verify: What is {captchaChallenge.a} + {captchaChallenge.b}?
                        </p>
                        {captchaError && (
                          <p className="text-red-500 text-xs mb-1.5">Incorrect, try again.</p>
                        )}
                        <div className="flex gap-2">
                          <input
                            type="number"
                            value={captchaInput}
                            onChange={(e) => setCaptchaInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleChallengeSubmit()}
                            className="w-20 px-2 py-1.5 border border-[#d3d3d3] rounded text-sm text-[#333] focus:outline-none focus:border-[#4285f4]"
                            placeholder="?"
                            data-testid="input-captcha-answer"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={handleChallengeSubmit}
                            className="px-3 py-1.5 bg-[#4285f4] text-white text-sm rounded hover:bg-[#3367d6] transition-colors"
                            data-testid="button-captcha-verify"
                          >
                            Verify
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {submitError && (
                    <div className="bg-red-500/20 border border-red-300/50 rounded-lg p-3 text-white text-sm">
                      {submitError}
                    </div>
                  )}

                  <div className="flex gap-3 pt-2">
                    <Link href="/">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="border-white/50 text-white hover:bg-white/20"
                        disabled={isSubmitting}
                      >
                        <ArrowLeft className="w-4 h-4" />
                      </Button>
                    </Link>
                    <Button
                      type="submit"
                      className="flex-1 bg-white text-teal-600 hover:bg-teal-50"
                      data-testid="button-submit-node-app"
                      disabled={isSubmitting || !captchaChecked || !allConfirmationsChecked() || !allRequiredAnswered()}
                    >
                      {isSubmitting ? 'Submitting...' : 'Submit Application'}
                    </Button>
                  </div>
                </form>
              </>
            )}
          </div>

          <div className="text-center text-teal-200 mt-6">
            <div className="flex items-center justify-center gap-2">
              <MapPin className="w-4 h-4" />
              <span>Windsor • Mississauga • London</span>
            </div>
            <span className="text-teal-300 text-sm">(Pilot)</span>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
