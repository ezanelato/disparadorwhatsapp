# Privacidade — ZapLista 0.1

ZapLista processa CSV/XLSX, telefones, nomes, campos de personalização, mensagens,
campanhas, estados e eventos exclusivamente neste perfil do navegador.
Campanhas, destinatários, eventos, exclusões e rascunho do painel ficam em
IndexedDB. Pequenas preferências podem usar chrome.storage.local. Um identificador
efêmero de sessão usa chrome.storage.session; ele não é uma credencial.

A extensão não tem backend, conta própria, telemetria, analytics, sincronização,
IA, CDN nem cobrança. Não lê nem exporta cookies, tokens ou credenciais do WhatsApp.
Não importa a agenda, participantes de grupos ou histórico de terceiros. Durante
uma tentativa, inspeciona apenas os elementos visíveis necessários para conferir
o contato escolhido, o rascunho e a nova saída correspondente.

O próprio WhatsApp Web continua usando a rede e seus serviços normalmente. O
tratamento feito pelo WhatsApp segue os termos e políticas do serviço.

Os dados locais não são criptografados pela extensão. Quem tem acesso ao perfil
do navegador pode acessá-los. O relatório CSV exportado fica sob sua guarda.

Em “Exclusões, histórico e dados locais”, selecione uma campanha já cancelada ou
concluída para excluí-la. Para limpar tudo, digite APAGAR e use “Apagar todos os
dados locais”. Isso inclui as exclusões; importar outro arquivo não as remove.
Apagar no ZapLista não desfaz mensagens já enviadas pelo WhatsApp nem remove
relatórios previamente exportados. Remover a extensão também remove seu
armazenamento de extensão neste perfil.

Use somente com pessoas que autorizaram a comunicação. ZapLista é independente
e não é produto oficial do WhatsApp ou da Meta.
