# Contribuindo

Use Node.js 22.12+ e npm. Execute `npm ci`, `npm run check` e os testes de navegador
descritos no README antes de propor uma alteração. Não adicione dependências
remotas ao runtime, segredos, dados reais, APIs privadas do WhatsApp ou código de
evasão de restrições. Os exemplos devem continuar fictícios.

Mudanças de seletores ficam em src/adapter/. Inclua fixtures do estado do DOM
sem dados reais e testes de falha segura. A confirmação exige ID novo, direção
de saída, texto completo e recibo positivo no mesmo elemento. Não enfraqueça
isso para fazer um layout passar. Preserve a atribuição de código adaptado.

Pausa/cancelamento devem invalidar a autorização persistida antes de um novo
clique. Nunca implemente retries de resultados incertos ou preenchimento de
quota com destinatários além do conjunto congelado. Faça transações locais
curtas e não mantenha o service worker vivo artificialmente.

Testes ao vivo exigem autorização específica para destinatários e texto. Os
scripts fornecidos usam perfil isolado, simulador e fixtures; não usam sessões
autenticadas reais. Não use o perfil pessoal do navegador em automação de teste.

Ao relatar bugs, descreva a versão de Chrome/WhatsApp e o estado observado,
removendo telefones, mensagens, nomes, tokens e qualquer informação pessoal.
