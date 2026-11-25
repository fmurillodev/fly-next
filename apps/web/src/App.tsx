import { useState } from "react";
import { Footer } from "./components/layout/footer";
import { Header } from "./components/layout/header";
import { AssessmentView, ResultHeader } from "./features/disruption/components/assessment-view";
import { BookingForm } from "./features/disruption/components/booking-form";
import { OverviewCards } from "./features/disruption/components/overview-cards";
import { Hero } from "./features/disruption/components/hero";
import { FailurePanel, LoadingPanel } from "./features/disruption/components/query-feedback";
import { useAssessment } from "./features/disruption/hooks/use-assessment";

export function App() {
  const { state, submit, reset } = useAssessment();
  const [queried, setQueried] = useState(false);

  function query(bookingId: string) {
    setQueried(true);
    void submit(bookingId);
  }

  return (
    <div className="flex min-h-screen flex-col">
      <div className="hero-surface">
        <Header />
        {state.status === "success" ? (
          <ResultHeader bookingId={state.bookingId} data={state.data} onNewQuery={reset} />
        ) : (
          <Hero>
            <BookingForm
              busy={state.status === "loading"}
              focusOnMount={queried}
              onSubmit={query}
            />
          </Hero>
        )}
      </div>

      <main className="mx-auto w-full max-w-page flex-1 px-5 py-6 sm:px-8">
        {state.status === "idle" && <OverviewCards />}
        {state.status === "loading" && <LoadingPanel bookingId={state.bookingId} />}
        {state.status === "failure" && (
          <FailurePanel
            reason={state.reason}
            requestId={state.requestId}
            onRetry={() => query(state.bookingId)}
          />
        )}
        {state.status === "success" && <AssessmentView data={state.data} />}
      </main>
      <Footer />
    </div>
  );
}
