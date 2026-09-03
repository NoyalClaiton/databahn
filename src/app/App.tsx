import type { ReactNode } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router";
import { AnimatePresence } from "motion/react";
import { SessionProvider, useSession } from "@/app/lib/SessionContext";
import { CruzProvider } from "@/app/lib/CruzContext";
import { cruzRespond } from "@/app/lib/cruzResponses";
import { AppShell } from "@/app/components/shared/AppShell";
import { PageTransition } from "@/app/components/shared/PageLayout";
import Dashboard from "@/app/pages/Dashboard";
import Sources from "@/app/pages/Sources";
import Destinations from "@/app/pages/Destinations";
import SourcePaloAlto from "@/app/pages/SourcePaloAlto";
import SourceEntraId from "@/app/pages/SourceEntraId";
import DestinationSentinel from "@/app/pages/DestinationSentinel";
import DestinationSplunk from "@/app/pages/DestinationSplunk";
import PipelineOverview from "@/app/pages/PipelineOverview";
import SearchExperience from "@/app/pages/SearchExperience";
import GraphView from "@/app/pages/GraphView";
import RulesLibrary from "@/app/pages/RulesLibrary";
import GenericConnectorWizard from "@/app/pages/GenericConnectorWizard";

/** AnimatePresence keyed on pathname so every route change slides rather than
 * hard-swapping (see PageTransition). */
function AnimatedRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<PageTransition><Dashboard /></PageTransition>} />
        <Route path="/sources" element={<PageTransition><Sources /></PageTransition>} />
        <Route path="/sources/paloalto" element={<PageTransition><SourcePaloAlto /></PageTransition>} />
        <Route path="/sources/entraid" element={<PageTransition><SourceEntraId /></PageTransition>} />
        <Route path="/sources/connect/:id" element={<PageTransition><GenericConnectorWizard kind="source" /></PageTransition>} />
        <Route path="/destinations" element={<PageTransition><Destinations /></PageTransition>} />
        <Route path="/destinations/sentinel" element={<PageTransition><DestinationSentinel /></PageTransition>} />
        <Route path="/destinations/splunk" element={<PageTransition><DestinationSplunk /></PageTransition>} />
        <Route path="/destinations/connect/:id" element={<PageTransition><GenericConnectorWizard kind="destination" /></PageTransition>} />
        <Route path="/pipeline" element={<PageTransition><PipelineOverview /></PageTransition>} />
        <Route path="/search" element={<PageTransition><SearchExperience /></PageTransition>} />
        <Route path="/graph" element={<PageTransition><GraphView /></PageTransition>} />
        <Route path="/rules" element={<PageTransition><RulesLibrary /></PageTransition>} />
      </Routes>
    </AnimatePresence>
  );
}

/** Cold storage's answer depends on whether one is actually connected, that
 * needs live session state, not just the raw keyword table cruzRespond
 * otherwise is. A thin wrapper inside SessionProvider is the only way to
 * reach useSession() before handing the closure down to CruzProvider. */
function CruzWithSession({ children }: { children: ReactNode }) {
  const { coldStorageTargets, wizard } = useSession();
  const coldStorageConnected = coldStorageTargets.length > 0;
  return (
    <CruzProvider respond={(text) => cruzRespond(text, coldStorageConnected, wizard?.connectorName, wizard?.connectorKind)}>{children}</CruzProvider>
  );
}

export default function App() {
  return (
    <SessionProvider>
      <CruzWithSession>
        {/* BASE_URL mirrors vite.config.ts's `base` automatically, so this
            never needs to be kept in sync with that value by hand, hardcode
            "/databahn/" here and the two would eventually drift. */}
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <AppShell>
            <AnimatedRoutes />
          </AppShell>
        </BrowserRouter>
      </CruzWithSession>
    </SessionProvider>
  );
}
