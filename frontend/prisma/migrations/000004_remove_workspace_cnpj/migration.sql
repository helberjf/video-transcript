-- O cadastro de imovel por CNPJ veio de outro projeto e nao faz parte do ModeloIA.
ALTER TABLE "workspaces" DROP COLUMN IF EXISTS "cnpj";
