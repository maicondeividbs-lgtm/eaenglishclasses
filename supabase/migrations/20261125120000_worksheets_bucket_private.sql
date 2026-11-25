-- Worksheets: bucket passa a ser PRIVADO.
-- Antes: qualquer pessoa baixava os 214 PDFs por URL pública, sem login.
-- Depois: só professores e coordenação (is_staff()) leem/assinam arquivos;
-- a Biblioteca gera links assinados (1 h para abrir, 7 dias para enviar ao aluno).
--
-- ORDEM DE APLICAÇÃO: publique primeiro o front-end da branch security-hardening
-- (biblioteca.html já usa /storage/v1/object/sign/worksheets/...). O código novo
-- funciona com o bucket público ou privado; o antigo quebra com o bucket privado.

update storage.buckets set public = false where id = 'worksheets';

-- Leitura (necessária para criar o link assinado): só staff autenticado.
drop policy if exists "worksheets staff list" on storage.objects;
drop policy if exists "worksheets staff read" on storage.objects;
create policy "worksheets staff read" on storage.objects
  for select to authenticated
  using (bucket_id = 'worksheets' and public.is_staff());

-- Upload continua restrito a staff (policy existente "auth_upload_worksheets").
-- avatars permanece público de propósito.
