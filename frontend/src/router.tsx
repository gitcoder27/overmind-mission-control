import { createRouter, createRootRoute, createRoute } from '@tanstack/react-router';
import { RootLayout } from '@/components/layout/RootLayout';
import { OverviewPage } from '@/routes/overview';
import { ProjectsListPage } from '@/routes/projects-list';
import { ProjectDetailPage } from '@/routes/project-detail';
import { LiveOpsPage } from '@/routes/live';
import { AgentsPage } from '@/routes/agents';
import { AgentDetailPage } from '@/routes/agent-detail';
import { CronPage } from '@/routes/cron';
import { SystemPage } from '@/routes/system';
import { SystemHealthPage } from '@/routes/system-health';

const rootRoute = createRootRoute({
  component: RootLayout,
});

const overviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: OverviewPage,
});

const projectsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/projects',
  component: ProjectsListPage,
});

const projectDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/projects/$projectId',
  component: function ProjectDetailWrapper() {
    const { projectId } = projectDetailRoute.useParams();
    return <ProjectDetailPage projectId={projectId} />;
  },
});

const liveRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/live',
  component: LiveOpsPage,
});

const agentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/agents',
  component: AgentsPage,
});

const agentDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/agents/$agentId',
  component: function AgentDetailWrapper() {
    const { agentId } = agentDetailRoute.useParams();
    return <AgentDetailPage agentId={agentId} />;
  },
});

const cronRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/scheduling/cron',
  component: CronPage,
});

const systemRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/system',
  component: SystemPage,
});

const systemHealthRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/system/health',
  component: SystemHealthPage,
});

const routeTree = rootRoute.addChildren([
  overviewRoute,
  projectsRoute,
  projectDetailRoute,
  liveRoute,
  agentsRoute,
  agentDetailRoute,
  cronRoute,
  systemRoute,
  systemHealthRoute,
]);

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
