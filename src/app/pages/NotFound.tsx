import { useLocation, useNavigate } from "react-router";
import { ErrorState } from "@/app/components/shared/StateViews";

/** An unknown address gets the same error card as a missing connector or
 * channel, with a way back, instead of a blank page. */
export default function NotFound() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  return (
    <div className="max-w-md mx-auto mt-16">
      <ErrorState
        title="We could not find that page"
        description={`Nothing lives at "${pathname}". It may have moved, or the link may be out of date.`}
        onRetry={() => navigate("/")}
        retryLabel="Back to dashboard"
      />
    </div>
  );
}
