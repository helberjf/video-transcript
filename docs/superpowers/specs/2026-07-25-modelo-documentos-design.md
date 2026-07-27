# Modelo de documentos para relatórios

## Objetivo

Adicionar uma nova atividade na área de Relatórios para criar e reutilizar modelos de documentos separados dos modelos de formulário já existentes na navegação lateral. Esse novo ativo deve representar um documento-base salvo no banco, usado como referência na geração de relatórios a partir de áudio ou vídeo transcrito.

O fluxo principal continua sendo: o usuário envia um vídeo ou áudio, o sistema transcreve a mídia, a IA lê a transcrição e então gera o relatório com base em:

1. a transcrição como fonte factual principal;
2. o modelo de documento salvo como referência estrutural e de conteúdo;
3. o template de relatório, quando selecionado, para definir a forma final do relatório;
4. o contexto temporário digitado na execução atual.

## Escopo

### Dentro do escopo

- Nova aba `Modelos de documentos` na tela de Relatórios.
- Upload de arquivos PDF, DOCX, ODT e formatos textuais suportados para criar um modelo de documento.
- Persistência do novo ativo em tabela própria, separada de `report_templates`.
- Armazenamento do arquivo original, texto extraído e metadados do documento-base.
- Campo de contexto padrão salvo junto ao modelo de documento.
- Campo de contexto temporário na geração do relatório.
- Seletor de modelo de documentos na tela de geração do relatório.
- Uso conjunto de transcrição, modelo de documento, template de relatório e contexto temporário no prompt final.

### Fora do escopo

- Migrar ou substituir a aba lateral `Modelos` existente.
- Redesenhar o motor de transcrição.
- Alterar a exportação final dos relatórios além do necessário para suportar o novo fluxo.
- Fazer o novo modelo documental participar do formulário da aba `Modelos` lateral.

## Conceitos

### Template de relatório

É o modelo já existente em `report_templates`. Ele continua representando a estrutura do relatório final, com prompt-base, exemplo de saída, instruções complementares e campos relacionados ao relatório.

### Modelo de documentos

É uma entidade nova, persistida separadamente, que representa um documento-base reutilizável para orientar a IA na produção de novos relatórios.

Esse modelo deve guardar:

- nome;
- descrição;
- categoria;
- arquivo original enviado;
- texto extraído do arquivo;
- instruções base do documento;
- contexto padrão salvo;
- data de criação e atualização;
- workspace.

### Contexto padrão

Texto salvo com o modelo de documentos. É parte permanente do ativo e sempre acompanha o uso desse modelo na geração de relatórios.

### Contexto temporário

Texto digitado pelo usuário apenas na execução atual de um relatório. Não sobrescreve o contexto padrão. Ele entra como camada adicional, específica daquela geração.

## Proposta de UX

### Tela de Relatórios

A tela `frontend/app/uploads/page.tsx` passa a ter cinco abas:

- `Arquivo local`
- `Gravar audio`
- `Modelos de documentos`
- `YouTube`
- `Instagram`

O toggle de contexto aparece em todas as abas de entrada de mídia. Quando ativado, revela um campo de texto para instruções temporárias da geração do relatório.

### Aba `Modelos de documentos`

Essa aba cria um novo modelo documental. O formulário deve conter:

- nome do modelo;
- descrição;
- categoria opcional;
- upload do arquivo base;
- contexto padrão;
- botão de salvar/criar.

O envio desse formulário não inicia transcrição nem geração de relatório. O objetivo é persistir um padrão reutilizável para uso posterior.

### Tela de geração do relatório

Na tela `frontend/app/uploads/[id]/page.tsx`, acima do seletor de template de relatório, deve existir um seletor `Modelo de documentos`.

Ordem visual esperada:

1. modelo de documentos;
2. template de relatório;
3. contexto adicional da execução atual.

Se o usuário já tiver preenchido contexto temporário antes, esse conteúdo pode ser pré-carregado na etapa de geração para edição final.

## Modelo de dados

Criar uma nova tabela para documentos-base, separada de `report_templates`. A estrutura mínima deve conter:

- `id`
- `workspace_id`
- `name`
- `description`
- `category`
- `source_filename`
- `source_mime_type`
- `source_path`
- `source_text`
- `base_instructions`
- `default_context`
- `created_at`
- `updated_at`

Regras:

- o arquivo original precisa ser armazenado em disco ou storage local, com caminho persistido no banco;
- o texto extraído deve ser salvo para consulta e reuso;
- o contexto padrão deve ser editável;
- nome deve ser único por workspace;
- o novo tipo de ativo não deve reutilizar a tabela de templates de formulário.

## Backend

### Novos endpoints

O backend deve expor rotas próprias para documentos-base, por exemplo:

- listar modelos de documentos;
- obter um modelo por id;
- criar um modelo a partir de upload;
- atualizar nome, descrição, categoria, contexto padrão e instruções;
- excluir modelo.

### Criação a partir de arquivo

O upload do documento base deve reaproveitar a extração de texto já existente para PDF, DOCX e ODT, além de texto simples quando aplicável. O processamento deve gerar o texto-base e persistir o arquivo original.

### Geração de relatório

`generate_report` deve aceitar campos adicionais:

- `document_model_id`
- `report_context`

Ao montar o prompt, a ordem deve ser:

1. transcrição;
2. instruções base do modelo documental;
3. contexto padrão do modelo documental;
4. template de relatório, se selecionado;
5. contexto temporário da execução;
6. outras instruções complementares já suportadas.

Se não houver modelo documental selecionado, o fluxo atual continua válido.

## Frontend

### Tela principal de Relatórios

- adicionar a nova aba de modelos de documentos;
- exibir o upload de documento base nessa aba;
- manter o upload de mídia e importação remota sem mudança de propósito;
- adicionar o toggle de contexto temporário em todas as abas de entrada.

### Tela de detalhe de upload

- carregar e listar modelos de documentos;
- adicionar seletor acima do template de relatório;
- enviar `document_model_id` e `report_context` no payload de geração;
- manter o template de relatório como escolha separada.

## Tratamento de erros

- arquivo vazio deve ser rejeitado;
- formatos não suportados devem retornar erro amigável;
- arquivo muito grande deve ser recusado;
- falha de extração deve impedir a criação do modelo;
- modelo inexistente ou de outro workspace deve retornar erro claro;
- contexto temporário vazio não deve impedir a geração.

## Testes

### Cobertura de backend

- criação de modelo de documentos a partir de PDF, DOCX e ODT;
- persistência do arquivo original e do texto extraído;
- listagem e recuperação por id;
- validação de nome único por workspace;
- geração de relatório usando modelo documental e contexto temporário;
- fallback quando o modelo documental não é informado.

### Cobertura de frontend

- nova aba `Modelos de documentos` na tela de relatórios;
- toggle de contexto temporário nas abas de mídia;
- criação de modelo documental sem redirecionar para a geração do relatório;
- seletor de modelo documental na tela de geração;
- envio correto dos novos campos no payload.

## Critério de aceite

- o usuário consegue criar um modelo de documentos separado dos modelos de formulário;
- o contexto padrão fica salvo junto ao modelo documental;
- o contexto temporário fica restrito à geração atual;
- a IA usa a transcrição do áudio/vídeo como base principal e combina as referências corretamente;
- os dois fluxos continuam separados na interface.
