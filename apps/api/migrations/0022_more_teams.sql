-- Two more teams a case can sit with, alongside TSA and ISA.
INSERT INTO "teams" ("code", "name") VALUES ('Admin', 'Admin'), ('Support', 'Support') ON CONFLICT ("code") DO NOTHING;
