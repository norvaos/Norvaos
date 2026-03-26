/**
 * Document Engine  -  Public API
 */

// Pure function engines
export { resolveFields, buildFieldMap, substituteFields, findMissingRequiredFields, applyTransform, getNestedValue } from './field-resolver'
export { evaluateAllConditions, evaluateConditionsDetailed, shouldInclude } from './condition-evaluator'
export { renderDocument } from './render-engine'
export type { RenderDocumentParams } from './render-engine'

// Services
export { logTemplateAudit, logInstanceEvent, logSignerEvent } from './audit-service'
export {
  createTemplate,
  createTemplateVersion,
  publishVersion,
  getTemplateWithVersion,
  cloneTemplate,
  archiveTemplate,
  deleteTemplate,
  listTemplates,
} from './template-service'
export type { CreateTemplateParams, CreateVersionParams } from './template-service'
export {
  generateInstance,
  regenerateInstance,
  transitionStatus,
  approveInstance,
  sendInstance,
  voidInstance,
  getInstanceWithDetails,
  listInstances,
  getDownloadUrl,
} from './instance-service'
export {
  createSignatureRequest,
  updateSignerStatus,
  sendSignerReminder,
} from './signature-service'
export {
  evaluateWorkflowRules,
  processDocumentWorkflowTrigger,
  getSuggestedDocuments,
} from './workflow-engine'
export type { WorkflowTriggerContext, WorkflowMatch } from './workflow-engine'
