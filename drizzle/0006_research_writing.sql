ALTER TABLE sources ADD metadata text NOT NULL DEFAULT '{}';
--> statement-breakpoint
CREATE TABLE reference_locks (project text PRIMARY KEY NOT NULL, token text NOT NULL, created integer NOT NULL);
--> statement-breakpoint
CREATE TABLE manuscripts (id text PRIMARY KEY NOT NULL, project text NOT NULL, title text NOT NULL, content text NOT NULL, revision integer NOT NULL, edit_token text NOT NULL, created integer NOT NULL, updated integer NOT NULL);
--> statement-breakpoint
CREATE INDEX manuscripts_project_idx ON manuscripts(project,updated);
--> statement-breakpoint
CREATE TABLE manuscript_revisions (document text NOT NULL, revision integer NOT NULL, title text NOT NULL, content text NOT NULL, created integer NOT NULL, PRIMARY KEY(document,revision));
--> statement-breakpoint
CREATE TRIGGER search_manuscripts_insert AFTER INSERT ON manuscripts BEGIN INSERT INTO project_search(project,kind,record_id,location,title,text) VALUES(new.project,'manuscript',new.id,'draft',new.title,new.content); END;
--> statement-breakpoint
CREATE TRIGGER search_manuscripts_update AFTER UPDATE OF title,content ON manuscripts BEGIN DELETE FROM project_search WHERE project=old.project AND kind='manuscript' AND record_id=old.id; INSERT INTO project_search(project,kind,record_id,location,title,text) VALUES(new.project,'manuscript',new.id,'draft',new.title,new.content); END;
--> statement-breakpoint
CREATE TABLE upload_parts (file text NOT NULL, part_number integer NOT NULL, sha256 text NOT NULL, size integer NOT NULL, etag text, state text NOT NULL, token text NOT NULL, updated integer NOT NULL, PRIMARY KEY(file,part_number));
--> statement-breakpoint
INSERT INTO upload_parts(file,part_number,sha256,size,etag,state,token,updated) SELECT files.id,json_extract(j.value,'$.partNumber'),json_extract(j.value,'$.sha256'),json_extract(j.value,'$.size'),json_extract(j.value,'$.etag'),'complete','migration',files.created FROM files JOIN json_each(files.parts) j WHERE files.status='uploading';
