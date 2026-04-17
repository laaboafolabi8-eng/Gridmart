import { useEffect, lazy, Suspense } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "./lib/auth";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";

const ProductDetail = lazy(() => import("@/pages/ProductDetail"));
const Cart = lazy(() => import("@/pages/Cart"));
const Checkout = lazy(() => import("@/pages/Checkout"));
const OrderConfirmation = lazy(() => import("@/pages/OrderConfirmation"));
const Orders = lazy(() => import("@/pages/Orders"));
const Nodes = lazy(() => import("@/pages/Nodes"));
const NodeDetail = lazy(() => import("@/pages/NodeDetail"));
const NodeDashboard = lazy(() => import("@/pages/NodeDashboard"));
const NodeSettings = lazy(() => import("@/pages/NodeSettings"));
const AdminDashboard = lazy(() => import("@/pages/AdminDashboard"));
const AdminLogin = lazy(() => import("@/pages/AdminLogin"));
const Login = lazy(() => import("@/pages/Login"));
const Register = lazy(() => import("@/pages/Register"));
const VerifyPhone = lazy(() => import("@/pages/VerifyPhone"));
const AddPhone = lazy(() => import("@/pages/AddPhone"));
const NodeApplication = lazy(() => import("@/pages/NodeApplication"));
const PickupAreas = lazy(() => import("@/pages/PickupAreas"));
const Contact = lazy(() => import("@/pages/Contact"));
const PrivacyPolicy = lazy(() => import("@/pages/PrivacyPolicy"));
const Terms = lazy(() => import("@/pages/Terms"));
const Wishlist = lazy(() => import("@/pages/Wishlist"));
const Agreement = lazy(() => import("@/pages/Agreement"));
const JoinNode = lazy(() => import("@/pages/JoinNode"));
const Account = lazy(() => import("@/pages/Account"));
const Feedback = lazy(() => import("@/pages/Feedback"));
const AboutUs = lazy(() => import("@/pages/AboutUs"));
const Screening = lazy(() => import("@/pages/Screening"));
const DropoutSurvey = lazy(() => import("@/pages/DropoutSurvey"));
const ThankYou = lazy(() => import("@/pages/ThankYou"));
const LandingPage = lazy(() => import("@/pages/LandingPage"));

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  );
}

function Router() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/shop" component={Home} />
        <Route path="/product/:slug" component={ProductDetail} />
        <Route path="/cart" component={Cart} />
        <Route path="/checkout" component={Checkout} />
        <Route path="/order/:id" component={OrderConfirmation} />
        <Route path="/orders" component={Orders} />
        <Route path="/nodes" component={Nodes} />
        <Route path="/pickup-areas" component={PickupAreas} />
        <Route path="/node/:id" component={NodeDetail} />
        <Route path="/node" component={NodeDashboard} />
        <Route path="/node-dashboard" component={NodeDashboard} />
        <Route path="/node-settings" component={NodeSettings} />
        <Route path="/login" component={Login} />
        <Route path="/register" component={Register} />
        <Route path="/verify-phone" component={VerifyPhone} />
        <Route path="/add-phone" component={AddPhone} />
        <Route path="/apply" component={NodeApplication} />
        <Route path="/admin/login" component={AdminLogin} />
        <Route path="/admin" component={AdminDashboard} />
        <Route path="/wishlist" component={Wishlist} />
        <Route path="/account" component={Account} />
        <Route path="/contact" component={Contact} />
        <Route path="/privacy" component={PrivacyPolicy} />
        <Route path="/terms" component={Terms} />
        <Route path="/agreement/:key" component={Agreement} />
        <Route path="/join/:token" component={JoinNode} />
        <Route path="/about" component={AboutUs} />
        <Route path="/thank-you" component={ThankYou} />
        <Route path="/feedback" component={Feedback} />
        <Route path="/screening/:token" component={Screening} />
        <Route path="/lp/:slug" component={LandingPage} />
        <Route path="/survey/:id" component={DropoutSurvey} />
        <Route path="/payment-success">
          {() => (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
              <div className="text-center p-8 bg-white rounded-xl shadow-lg max-w-md">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                </div>
                <h1 className="text-2xl font-bold text-gray-900 mb-2" data-testid="text-payment-success">Payment Successful!</h1>
                <p className="text-gray-600">Thank you for your payment. You may close this page.</p>
              </div>
            </div>
          )}
        </Route>
        <Route path="/payment-cancelled">
          {() => (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
              <div className="text-center p-8 bg-white rounded-xl shadow-lg max-w-md">
                <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </div>
                <h1 className="text-2xl font-bold text-gray-900 mb-2" data-testid="text-payment-cancelled">Payment Cancelled</h1>
                <p className="text-gray-600">The payment was not completed. Please try again using the link provided.</p>
              </div>
            </div>
          )}
        </Route>
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  const { checkSession } = useAuth();

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <SonnerToaster position="top-right" richColors />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
