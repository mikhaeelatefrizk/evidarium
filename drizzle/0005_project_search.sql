CREATE VIRTUAL TABLE project_search USING fts5(project UNINDEXED,kind UNINDEXED,record_id UNINDEXED,location UNINDEXED,title,text,tokenize='unicode61');
--> statement-breakpoint
CREATE TRIGGER search_sources_insert AFTER INSERT ON sources BEGIN INSERT INTO project_search (project,kind,record_id,location,title,text) SELECT sources.project,'source',id,'abstract',title||' '||authors,abstract FROM sources WHERE sources.id=new.id; END;
--> statement-breakpoint
CREATE TRIGGER search_sources_update AFTER UPDATE OF title,authors,abstract ON sources BEGIN DELETE FROM project_search WHERE project=old.project AND kind='source' AND record_id=old.id; INSERT INTO project_search (project,kind,record_id,location,title,text) SELECT sources.project,'source',id,'abstract',title||' '||authors,abstract FROM sources WHERE sources.id=new.id; END;
--> statement-breakpoint
CREATE TRIGGER search_sources_delete AFTER DELETE ON sources BEGIN DELETE FROM project_search WHERE project=old.project AND kind='source' AND record_id=old.id; END;
--> statement-breakpoint
CREATE TRIGGER search_messages_insert AFTER INSERT ON messages BEGIN INSERT INTO project_search (project,kind,record_id,location,title,text) SELECT messages.project,'conversation',id,'conversation',role,content FROM messages WHERE messages.id=new.id AND status IN ('complete','partial','imported'); END;
--> statement-breakpoint
CREATE TRIGGER search_messages_update AFTER UPDATE OF content,status ON messages BEGIN DELETE FROM project_search WHERE project=old.project AND kind='conversation' AND record_id=old.id; INSERT INTO project_search (project,kind,record_id,location,title,text) SELECT messages.project,'conversation',id,'conversation',role,content FROM messages WHERE messages.id=new.id AND status IN ('complete','partial','imported'); END;
--> statement-breakpoint
CREATE TRIGGER search_messages_delete AFTER DELETE ON messages BEGIN DELETE FROM project_search WHERE project=old.project AND kind='conversation' AND record_id=old.id; END;
--> statement-breakpoint
CREATE TRIGGER search_notes_insert AFTER INSERT ON notes BEGIN INSERT INTO project_search (project,kind,record_id,location,title,text) SELECT notes.project,'note',id,'note','Research note',content FROM notes WHERE notes.id=new.id; END;
--> statement-breakpoint
CREATE TRIGGER search_notes_update AFTER UPDATE OF content ON notes BEGIN DELETE FROM project_search WHERE project=old.project AND kind='note' AND record_id=old.id; INSERT INTO project_search (project,kind,record_id,location,title,text) SELECT notes.project,'note',id,'note','Research note',content FROM notes WHERE notes.id=new.id; END;
--> statement-breakpoint
CREATE TRIGGER search_notes_delete AFTER DELETE ON notes BEGIN DELETE FROM project_search WHERE project=old.project AND kind='note' AND record_id=old.id; END;
--> statement-breakpoint
CREATE TRIGGER search_tasks_insert AFTER INSERT ON tasks BEGIN INSERT INTO project_search (project,kind,record_id,location,title,text) SELECT tasks.project,'analysis',id,'result',kind,COALESCE(result,'') FROM tasks WHERE tasks.id=new.id AND state IN ('completed','imported') AND kind!='chat'; END;
--> statement-breakpoint
CREATE TRIGGER search_tasks_update AFTER UPDATE OF state,result ON tasks BEGIN DELETE FROM project_search WHERE project=old.project AND kind='analysis' AND record_id=old.id; INSERT INTO project_search (project,kind,record_id,location,title,text) SELECT tasks.project,'analysis',id,'result',kind,COALESCE(result,'') FROM tasks WHERE tasks.id=new.id AND state IN ('completed','imported') AND kind!='chat'; END;
--> statement-breakpoint
CREATE TRIGGER search_tasks_delete AFTER DELETE ON tasks BEGIN DELETE FROM project_search WHERE project=old.project AND kind='analysis' AND record_id=old.id; END;
--> statement-breakpoint
CREATE TRIGGER search_claims_insert AFTER INSERT ON claims BEGIN INSERT INTO project_search (project,kind,record_id,location,title,text) SELECT claims.project,'claim',id,location,statement,statement||' '||quote FROM claims WHERE claims.id=new.id; END;
--> statement-breakpoint
CREATE TRIGGER search_claims_update AFTER UPDATE OF statement,quote,location ON claims BEGIN DELETE FROM project_search WHERE project=old.project AND kind='claim' AND record_id=old.id; INSERT INTO project_search (project,kind,record_id,location,title,text) SELECT claims.project,'claim',id,location,statement,statement||' '||quote FROM claims WHERE claims.id=new.id; END;
--> statement-breakpoint
CREATE TRIGGER search_claims_delete AFTER DELETE ON claims BEGIN DELETE FROM project_search WHERE project=old.project AND kind='claim' AND record_id=old.id; END;
--> statement-breakpoint
CREATE TRIGGER search_files_insert AFTER INSERT ON files BEGIN INSERT INTO project_search (project,kind,record_id,location,title,text) SELECT files.project,'file',files.id,json_extract(j.value,'$.location'),name,json_extract(j.value,'$.text') FROM files JOIN json_each(CASE WHEN json_valid(extracted) THEN extracted ELSE '{}' END,'$.segments') j WHERE files.id=new.id AND json_valid(extracted); END;
--> statement-breakpoint
CREATE TRIGGER search_files_update AFTER UPDATE OF extracted ON files BEGIN DELETE FROM project_search WHERE project=old.project AND kind='file' AND record_id=old.id; INSERT INTO project_search (project,kind,record_id,location,title,text) SELECT files.project,'file',files.id,json_extract(j.value,'$.location'),name,json_extract(j.value,'$.text') FROM files JOIN json_each(CASE WHEN json_valid(extracted) THEN extracted ELSE '{}' END,'$.segments') j WHERE files.id=new.id AND json_valid(extracted); END;
--> statement-breakpoint
CREATE TRIGGER search_files_delete AFTER DELETE ON files BEGIN DELETE FROM project_search WHERE project=old.project AND kind='file' AND record_id=old.id; END;
