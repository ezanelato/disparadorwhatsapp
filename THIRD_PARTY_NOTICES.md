# Atribuições

O código novo de ZapLista é MIT. Consulte LICENSE.

Foi consultada a extensão do projeto local Gatherco (MIT, Copyright (c) 2026
Márcio Junior), incluindo manifest, worker, content, navegação, painéis, saúde,
mensagens, estado de entrega, digitação, testes e RESTRICTED-TEST.md.
As rotinas daqui foram escritas para este projeto. A recuperação de painéis,
conferência do contato e análise de corpo/recibo foram informadas pela referência.
Não foram copiados o projeto, dados, tokens, credenciais, infraestrutura ou IA.
Nenhum arquivo do Gatherco foi alterado. Por cautela de atribuição de padrões
adaptados, preserva-se o aviso completo abaixo:

MIT License

Copyright (c) 2026 Márcio Junior

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Bibliotecas distribuídas

- csv-parse: MIT, projeto Adaltas/node-csv.
- libphonenumber-js: MIT, Nikolay Kuchumov e colaboradores; metadados derivados de Google libphonenumber (Apache-2.0). Os avisos originais estão em licenses/ na distribuição.
- read-excel-file: MIT, Nikolay Kuchumov e colaboradores.
- fflate: MIT, Arjun Barrett. A etapa de build conecta a descompressão do leitor XLSX a um adaptador local com unzipSync para evitar workers Blob incompatíveis com CSP e limitar expansão do arquivo. O leitor não é alterado no node_modules.

As licenças originais dessas dependências são incluídas pelo build em dist/licenses/.
Ferramentas de desenvolvimento e testes não fazem parte do runtime da extensão.
