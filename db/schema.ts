import { sqliteTable, text, integer, index, uniqueIndex, primaryKey } from 'drizzle-orm/sqlite-core';
export const projects = sqliteTable('projects', {id:text('id').primaryKey(),owner:text('owner').notNull(),title:text('title').notNull(),question:text('question').notNull().default(''),criteria:text('criteria').notNull().default(''),allowSearch:integer('allow_search').notNull().default(1),created:integer('created').notNull(),updated:integer('updated').notNull()},t=>[index('projects_lookup_idx').on(t.owner,t.updated)]);
export const messages = sqliteTable('messages',{id:text('id').primaryKey(),project:text('project').notNull(),role:text('role').notNull(),content:text('content').notNull(),status:text('status').notNull().default('complete'),citationAudit:text('citation_audit'),model:text('model'),created:integer('created').notNull()},t=>[index('messages_lookup_idx').on(t.project,t.created)]);
export const sources = sqliteTable('sources',{id:text('id').primaryKey(),project:text('project').notNull(),title:text('title').notNull(),doi:text('doi'),url:text('url'),authors:text('authors').notNull().default(''),year:integer('year'),abstract:text('abstract').notNull().default(''),metadata:text('metadata').notNull().default('{}'),origin:text('origin').notNull(),externalId:text('external_id'),pmcid:text('pmcid'),access:text('access').notNull().default('unknown'),stage:text('stage').notNull().default('title_abstract'),decision:text('decision').notNull().default('unknown'),reason:text('reason').notNull().default(''),created:integer('created').notNull()},t=>[index('sources_lookup_idx').on(t.project,t.created)]);
export const files = sqliteTable('files',{id:text('id').primaryKey(),project:text('project').notNull(),name:text('name').notNull(),mime:text('mime').notNull(),size:integer('size').notNull(),key:text('key').notNull(),status:text('status').notNull(),uploadId:text('upload_id'),parts:text('parts').notNull().default('[]'),extracted:text('extracted'),sha256:text('sha256'),sourceId:text('source_id'),linkRevision:integer('link_revision').notNull().default(0),provenance:text('provenance'),created:integer('created').notNull()},t=>[index('files_lookup_idx').on(t.project,t.created),uniqueIndex('files_source_idx').on(t.project,t.sourceId)]);
export const tasks = sqliteTable('tasks',{id:text('id').primaryKey(),project:text('project').notNull(),kind:text('kind').notNull(),args:text('args').notNull(),state:text('state').notNull(),result:text('result'),error:text('error'),created:integer('created').notNull(),updated:integer('updated').notNull()},t=>[index('tasks_lookup_idx').on(t.project,t.created)]);
export const audit = sqliteTable('audit',{id:text('id').primaryKey(),project:text('project').notNull(),action:text('action').notNull(),detail:text('detail').notNull(),created:integer('created').notNull()},t=>[index('audit_lookup_idx').on(t.project,t.created)]);
export const notes = sqliteTable('notes',{id:text('id').primaryKey(),project:text('project').notNull(),content:text('content').notNull(),created:integer('created').notNull()},t=>[index('notes_lookup_idx').on(t.project,t.created)]);
export const claims = sqliteTable('claims',{id:text('id').primaryKey(),project:text('project').notNull(),statement:text('statement').notNull(),stance:text('stance').notNull(),sourceId:text('source_id'),fileId:text('file_id'),location:text('location').notNull(),quote:text('quote').notNull(),status:text('status').notNull().default('unreviewed'),verification:text('verification').notNull(),created:integer('created').notNull()},t=>[index('claims_lookup_idx').on(t.project,t.created)]);

export const searchIndexes = sqliteTable('search_indexes',{project:text('project').primaryKey(),revision:integer('revision').notNull(),indexed:integer('indexed').notNull()});

export const manuscripts = sqliteTable('manuscripts',{id:text('id').primaryKey(),project:text('project').notNull(),title:text('title').notNull(),content:text('content').notNull(),revision:integer('revision').notNull(),editToken:text('edit_token').notNull(),created:integer('created').notNull(),updated:integer('updated').notNull()},t=>[index('manuscripts_project_idx').on(t.project,t.updated)]);

export const manuscriptRevisions = sqliteTable('manuscript_revisions',{document:text('document').notNull(),revision:integer('revision').notNull(),title:text('title').notNull(),content:text('content').notNull(),created:integer('created').notNull()},t=>[primaryKey({columns:[t.document,t.revision]})]);
export const uploadParts = sqliteTable('upload_parts',{file:text('file').notNull(),partNumber:integer('part_number').notNull(),sha256:text('sha256').notNull(),size:integer('size').notNull(),etag:text('etag'),state:text('state').notNull(),token:text('token').notNull(),updated:integer('updated').notNull()},t=>[primaryKey({columns:[t.file,t.partNumber]})]);
export const referenceLocks = sqliteTable('reference_locks',{project:text('project').primaryKey(),token:text('token').notNull(),created:integer('created').notNull()});

export const reviewWorkspaces = sqliteTable('review_workspaces',{project:text('project').primaryKey(),data:text('data').notNull(),revision:integer('revision').notNull(),editToken:text('edit_token').notNull(),updated:integer('updated').notNull()});
export const reviewRevisions = sqliteTable('review_revisions',{project:text('project').notNull(),revision:integer('revision').notNull(),data:text('data').notNull(),reason:text('reason').notNull(),actor:text('actor').notNull(),sha256:text('sha256').notNull(),created:integer('created').notNull()},t=>[primaryKey({columns:[t.project,t.revision]})]);

// Independent screening is intentionally separate from the owner's legacy ledger.
export const screeningMembers = sqliteTable('screening_members', {
 project:text('project').notNull(), userId:text('user_id').notNull(), email:text('email').notNull(), displayName:text('display_name').notNull(),
 status:text('status').notNull(), revision:integer('revision').notNull(), editToken:text('edit_token').notNull(), created:integer('created').notNull(), updated:integer('updated').notNull(),
},t=>[primaryKey({columns:[t.project,t.userId]}),index('screening_members_user_idx').on(t.userId,t.status)]);
export const screeningInvitations = sqliteTable('screening_invitations', {
 id:text('id').primaryKey(), project:text('project').notNull(), email:text('email').notNull(), tokenHash:text('token_hash').notNull(), status:text('status').notNull(),
 revision:integer('revision').notNull(), expires:integer('expires').notNull(), createdBy:text('created_by').notNull(), acceptedBy:text('accepted_by'),
 editToken:text('edit_token').notNull(), created:integer('created').notNull(), updated:integer('updated').notNull(),
},t=>[uniqueIndex('screening_invitation_token_idx').on(t.tokenHash),index('screening_invitation_project_idx').on(t.project,t.created)]);
export const screeningRounds = sqliteTable('screening_rounds', {
 id:text('id').primaryKey(), project:text('project').notNull(), sourceId:text('source_id').notNull(), stage:text('stage').notNull(), round:integer('round').notNull(),
 activeKey:text('active_key'), snapshot:text('snapshot').notNull(), snapshotHash:text('snapshot_hash').notNull(), reviewerA:text('reviewer_a').notNull(), reviewerB:text('reviewer_b').notNull(),
 generationA:integer('generation_a').notNull(), generationB:integer('generation_b').notNull(), status:text('status').notNull(), revision:integer('revision').notNull(),
 finalDecision:text('final_decision'), finalReason:text('final_reason'), resolvedBy:text('resolved_by'), editToken:text('edit_token').notNull(), created:integer('created').notNull(), updated:integer('updated').notNull(),
},t=>[uniqueIndex('screening_active_round_idx').on(t.project,t.activeKey),uniqueIndex('screening_round_number_idx').on(t.project,t.sourceId,t.stage,t.round),index('screening_rounds_project_idx').on(t.project,t.created)]);
export const screeningDecisions = sqliteTable('screening_decisions', {
 roundId:text('round_id').notNull(), reviewer:text('reviewer').notNull(), decision:text('decision'), reason:text('reason').notNull(), revision:integer('revision').notNull(),
 editToken:text('edit_token').notNull(), submitted:integer('submitted'),
},t=>[primaryKey({columns:[t.roundId,t.reviewer]})]);
export const screeningEvents = sqliteTable('screening_events', {
 id:text('id').primaryKey(), project:text('project').notNull(), roundId:text('round_id'), action:text('action').notNull(), actor:text('actor').notNull(), detail:text('detail').notNull(), created:integer('created').notNull(),
},t=>[index('screening_events_project_idx').on(t.project,t.created)]);
