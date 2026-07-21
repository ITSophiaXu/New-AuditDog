import { Routes, Route, Navigate } from 'react-router-dom'
import AppShell from '@/components/AppShell'
import Home from '@/pages/Home'
import OntologyManager from '@/pages/OntologyManager'
import KnowledgeCenter from '@/pages/KnowledgeCenter'
import SpecialAuditWorkbench from '@/pages/SpecialAuditWorkbench'
import SpecialAuditNew from '@/pages/SpecialAuditNew'
import IntakeWizard from '@/pages/IntakeWizard'
import ObjectExplorer from '@/pages/ObjectExplorer'
import WorkingPaperWorkbench from '@/pages/WorkingPaperWorkbench'
import AgentStudio from '@/pages/AgentStudio'
import AgentGallery from '@/pages/AgentGallery'
import MCPServers from '@/pages/MCPServers'
import ScenarioTemplates from '@/pages/ScenarioTemplates'
import LearningInbox from '@/pages/LearningInbox'
import TemplateUpload from '@/pages/TemplateUpload'
import RuleAuthoring from '@/pages/RuleAuthoring'
import ProjectArchive from '@/pages/ProjectArchive'
import ReportReview from '@/pages/ReportReview'
import DetailTest from '@/pages/DetailTest'
import BankReconciliation from '@/pages/BankReconciliation'
import AnnualAuditProjectSetup from '@/pages/AnnualAuditProjectSetup'
import AnnualAuditHub from '@/pages/AnnualAuditHub'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<AppShell />}>
        <Route index element={<Home />} />
        <Route path="knowledge" element={<KnowledgeCenter />} />
        <Route path="knowledge/intake" element={<IntakeWizard />} />
        <Route path="ontology" element={<OntologyManager />} />
        <Route path="ontology/:code" element={<OntologyManager />} />
        <Route path="explorer" element={<ObjectExplorer />} />
        <Route path="explorer/:code" element={<ObjectExplorer />} />
        <Route path="workbench" element={<WorkingPaperWorkbench />} />
        <Route path="workbench/:paperId" element={<WorkingPaperWorkbench />} />
        <Route path="annual-audit" element={<AnnualAuditHub />} />
        <Route path="annual-audit/new" element={<AnnualAuditProjectSetup />} />
        <Route path="annual-audit/:projectCode" element={<AnnualAuditProjectSetup />} />
        <Route path="special-audit" element={<SpecialAuditWorkbench />} />
        <Route path="special-audit/new" element={<SpecialAuditNew />} />
        <Route path="special-audit/:caseId" element={<SpecialAuditWorkbench />} />
        <Route path="agents" element={<AgentGallery />} />
        <Route path="agents/:code" element={<AgentStudio />} />
        <Route path="mcp" element={<MCPServers />} />
        <Route path="scenarios" element={<ScenarioTemplates />} />
        <Route path="learning-inbox" element={<LearningInbox />} />
        <Route path="templates/upload" element={<TemplateUpload />} />
        <Route path="rules/new" element={<RuleAuthoring />} />
        <Route path="archive" element={<ProjectArchive />} />
        <Route path="report-review" element={<ReportReview />} />
        <Route path="report-review/:reviewId" element={<ReportReview />} />
        <Route path="bank-recon" element={<BankReconciliation />} />
        <Route path="detail-test" element={<DetailTest />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
