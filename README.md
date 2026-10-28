# ZapLista

Extensão open source **Chrome Manifest V3** para mensagens de texto individuais
no WhatsApp Web, com painel lateral em português. Sem backend, localhost, IA,
conta própria ou serviço pago. Código novo sob licença MIT.

## Instalação

1. Use Chrome 120+. Extraia `release/zaplista-0.1.5.zip`, ou use a pasta `dist/`.
2. Abra `chrome://extensions`, ative **Modo do desenvolvedor**, clique em **Carregar sem compactação** e escolha a pasta que contém `manifest.json` (normalmente `dist`).
3. Abra `https://web.whatsapp.com/`, autentique-se normalmente e atualize essa aba depois de instalar/recarregar a extensão.
4. Fixe o ícone ZapLista e clique nele para abrir o **painel lateral**.
5. Escolha explicitamente a aba e clique **Vincular**. Mantenha essa aba ativa e visível, com a janela em foco. Use uma aba normal do Chrome, com barra de endereços: janelas instaladas como aplicativo/PWA não oferecem o painel lateral. Não é necessário Node nem servidor para usar a distribuição pronta.

### Atualizar para 0.1.5

A 0.1.5 ignora contatos quando a busca mostra um aviso estável de nenhum
resultado, limpa a busca e continua a fila. Após clicar em Enviar, registra
**Envio acionado** e segue respeitando o intervalo, sem esperar recibo ou
confirmação visual. Erros de navegação continuam pausando a campanha.

A 0.1.4 confere números brasileiros pelo mesmo DDD e pelos oito dígitos finais,
aceitando a diferença do nono dígito. Fecha Dados do contato, lê o texto renderizado
do painel e aguarda o editor após uma conferência válida. DDD ou oito dígitos
finais divergentes continuam bloqueando o envio.

A 0.1.3 usa a pesquisa diretamente em **Nova conversa**, espera o contato,
clica para abrir, confere o telefone e só então escreve e envia. Não entra na
opção Número de telefone. Se a busca falhar, mantém a etapa visível para
conferência, sem fechar e reabrir o painel automaticamente.

Em `chrome://extensions`, clique **Recarregar** no ZapLista e depois dê **F5 na
aba do WhatsApp**. A extensão verifica a versão do código na aba e bloqueia uma
aba desatualizada com instrução de atualização. O armazenamento e a interface
existentes são preservados; não é necessário remover/reinstalar a extensão.
Retomar processa somente pendentes: tentativas que já falharam não são repetidas.
Para testar um contato que ficou em “Falha antes do envio”, cancele a campanha
anterior e revise uma nova. Nunca recrie para repetir um resultado incerto sem
conferir primeiro a conversa.

A 0.1.1 adapta o caminho nativo de referência do Gatherco: entrada de telefone,
ativação de resultados com foco/eventos DOM, distinção entre input da extensão e
intervenção humana, espera por transições de painéis e identificação única dos
botões pelos ícones. A fila, os limites e a interface foram preservados.

A 0.1.2 corrige a falha “Pesquisa ou painel alterado durante a navegação”
observada na gravação: preenchimento progressivo do Telefone como no Gatherco,
leitura por value/textContent com comparação dos dígitos e espera limitada pela
filtragem nativa. Formatação visual e marcas de direção do campo não são tratadas
como mudança do número. A conferência do telefone no contato continua obrigatória.

Comece pelo **Simulador local**, escolhido no topo. Ele usa a mesma fila e
persistência sem controlar abas nem enviar mensagens reais. As campanhas e os
relatórios de simulação são identificados explicitamente.

## Fluxo

**Contatos:** importe CSV ou XLSX de até 10 MB, 10.000 linhas e 100 colunas. A
primeira linha deve ter cabeçalhos únicos e não vazios. Escolha a planilha XLSX,
o país padrão e mapeie Telefone, Nome e Empresa. Clique **Aplicar mapeamento**.
Outras colunas ficam disponíveis pelo nome original. Remapear reinicia a seleção.

CSV aceita UTF-8/BOM, vírgula, ponto e vírgula, tabulação, campos entre aspas,
aspas escapadas e quebras dentro de campos. No XLSX, salve telefones como **texto**:
células numéricas são recusadas porque podem já ter perdido zeros. Notação
científica, ramais e dígitos ambíguos são recusados. A validação usa
libphonenumber-js/max. Não adiciona nono dígito nem remove prefixos silenciosamente.

Marque todos ou escolha individualmente. Inválidos e duplicados mostram o motivo.
Excluir linha não adiciona o telefone à lista de exclusão; **Não enviar** adiciona.
A lista mantém a ordem original ao paginar. `examples/leads.csv` usa nomes
fictícios e números americanos da faixa reservada para ficção; não os use para
testes reais.

**Mensagem:** escreva texto com emojis e quebras de linha (até 10.000 caracteres).
Use `{{nome}}`, `{{empresa}}` ou `{{nome exato da coluna}}`. Os aliases `nome` e
`empresa` vêm do mapeamento e têm prioridade sobre colunas homônimas. Veja a prévia
por contato, preencha substitutos para dados ausentes ou desmarque os afetados.
Variáveis não resolvidas bloqueiam o início.

**Quantidade de destinatários** deve ser inteiro positivo até o total elegível
selecionado. Importar 500 e escolher 50 congela os primeiros 50 únicos elegíveis,
na ordem exibida. Uma falha não adiciona um 51º contato nem busca 50 sucessos.
Depois de remover contatos, confira novamente a quantidade antes de revisar.

O intervalo fixo padrão é **60 segundos** (mínimo 30, máximo 86.400). É uma escolha
operacional, sem promessa de evitar restrições. O horário é previsto: alarmes do
Chrome podem atrasar, inclusive após suspensão do computador.

**Revisão:** confira a lista final, expanda cada mensagem e confirme a autorização
de comunicação. Iniciar congela a lista e o texto por destinatário. Alterar o
editor depois não muda a campanha ativa. **Resultados:** acompanha estados,
pausa, retoma e cancela. Só uma campanha pode permanecer ativa, incluindo pausada.
Para iniciar outra, conclua ou cancele a atual. Fechar/reabrir o painel não cria
outro executor nem perde os dados.

## Operação e interrupções

O adaptador usa somente a interface visível: Nova conversa → pesquisa do número,
resultado único e estável e abertura de Dados do contato. Para números brasileiros,
confere país Brasil, **mesmo DDD e mesmos oito dígitos finais**, aceitando a
diferença do nono dígito. Para outros países, exige o número internacional completo.
Não altera o número importado nem confia apenas no nome do contato.
Grupos, rascunho, telefone divergente, logout, aba oculta, intervenção manual e
interface desconhecida bloqueiam a tentativa e pausam a fila. Não interaja com a
página durante uma tentativa; os controles ficam no painel.

Nenhum rascunho é apagado. Se a extensão inseriu texto mas não enviou, ele fica
para conferência humana e pode bloquear a próxima tentativa. Resolva esse
rascunho antes de retomar. Falha de navegação nos painéis Telefone/Nova conversa
tenta recuperar a lista usando somente Voltar/Fechar desses painéis, até três
etapas, e confirma Tudo. Não usa histórico do navegador, URL de envio, APIs
privadas nem módulos internos do WhatsApp.

Estados: pendente, em preparação, envio autorizado, envio acionado, confirmado na interface,
falha anterior ao envio, resultado incerto, ignorado e cancelado. A intenção é
persistida **antes** de autorizar um único clique. Perda de confirmação depois
da intenção é incerta, mesmo se o clique talvez não tenha ocorrido. Falhas e
incertos nunca são reenviados automaticamente; retomar processa apenas pendentes
do conjunto congelado. Confira incertos manualmente na conversa.

Na operação real, o retorno após o clique é **Envio acionado**: não espera mensagem
nova nem recibo e não comprova entrega ou leitura. O status antigo Confirmado na
interface permanece disponível no histórico e no simulador. Se a comunicação
se perder após a intenção persistida, o resultado continua incerto, sem reenvio.

Pausar/cancelar revoga a autorização persistida e sinaliza a aba. Aguarde a
tentativa em voo encerrar antes de retomar. Um clique já feito não pode ser
desfeito e pode terminar confirmado após a pausa. Há uma janela inerente entre
autorização entre contextos e clique DOM; não há garantia absoluta de “exactly once”.

O executor vive no service worker. IndexedDB mantém estados, leases e tentativas
em transações. Timestamps e `chrome.alarms` controlam a espera, sem keepalive.
Suspensão do worker entre envios conserva a previsão; perda durante tentativa
pausa e converte preparação em falha ou intenção em incerto. Reinício do navegador
exige retomada explícita. Navegar/recarregar/fechar a aba pausa. Aba fechada não é
substituída automaticamente: cancele e revise uma nova campanha com outra aba.

## Relatório, exclusões e apagar dados

Em Resultados use **Exportar relatório CSV**. Inclui modo, ordem, telefone, nome,
mensagem congelada, estado, motivo, ID observado, horário e eventos por contato.
Usa UTF-8 com BOM e `;`. Células que poderiam executar fórmulas recebem apóstrofo;
telefones com `+` também recebem essa proteção.

Em **Exclusões, histórico e dados locais**, adicione telefones completos em
“Não enviar para”. Reimportar não remove exclusões. Adicionar durante execução
pausa a fila; pendentes excluídos são ignorados na retomada, sem reposição. Um
clique já ocorrido não pode ser desfeito. Remover exclusão não reabilita linhas
da importação anterior: reimporte ou reaplique o mapeamento.

Escolha uma campanha concluída/cancelada no histórico para excluí-la com seus
destinatários/eventos. Para remover tudo, digite **APAGAR** e use o botão
correspondente. Isso inclui rascunho e exclusões. Não remove mensagens do WhatsApp
nem CSVs já baixados. Leia [PRIVACY.md](PRIVACY.md).

## Desenvolvimento e build

Recomendado: Node.js **22.12+**, npm e Chromium do Playwright para os testes de
navegador. A extensão em si não depende de Node instalado.

```sh
npm ci
npm run check
npx playwright install chromium
npm run test:visual
npm run test:extension
```

`npm run check` executa typecheck, testes e build. Individualmente:
`npm run typecheck`, `npm test`, `npm run build`. O build gera a extensão em
`dist/` e `release/zaplista-0.1.5.zip` com manifest na raiz. Não publica em loja,
cria remoto ou faz push. Testes de navegador usam perfil isolado e produzem
evidências em `test-results/`. `ZAPLISTA_BROWSER` pode apontar para um executável
Chromium local compatível com carregamento de extensão.

Os testes incluem importação, quantidade exata, personalização, exclusões,
transações, disputa entre executores, pausa/cancelamento, reinício, falha versus
incerto, rascunho, identidade e confirmação com ID novo. Fixtures DOM não contêm
dados reais. O simulador não envia pelo WhatsApp. **Testes simulados não validam
envio real**. Testes reais exigem autorização específica de números e conteúdo.
Consulte `VALIDATION.md` para o que efetivamente foi executado nesta entrega.

### Estrutura e identidade visual

- `src/ui/`: painel lateral, interface DOM leve e tema.
- `src/core/`: importação, normalização, personalização, estados, fila e CSV seguro.
- `src/persistence/`: IndexedDB transacional.
- `src/adapter/`: seletores, adaptador DOM e simulador.
- `src/protocol.ts`, `src/worker.ts`, `src/content.ts`: comunicação validada entre contextos isolados.
- `brand.json`: nome, descrição, cores, versão e inicial. O build gera manifest e ícones locais. Edite o desenho do ícone em `scripts/build.mjs` ou substitua os PNGs gerados. Demais tokens em `src/ui/theme.css`.

Decisões: TypeScript + esbuild, sem framework adicional; libphonenumber-js/max;
csv-parse; read-excel-file 7. O build conecta somente a fronteira unzip do leitor
XLSX a fflate local com limite de expansão (48 MB total, 24 MB por entrada), sem
workers Blob ou código remoto. Versões efetivas fixadas em package-lock.json.
O Gatherco foi consultado como referência local, sem alterações. Atribuições em
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Permissões e fontes técnicas

- `sidePanel`: [painel lateral oficial do Chrome](https://developer.chrome.com/docs/extensions/reference/api/sidePanel).
- `alarms`: [previsões sujeitas a atraso](https://developer.chrome.com/docs/extensions/reference/api/alarms).
- `storage`: [preferências e sessão efêmera](https://developer.chrome.com/docs/extensions/reference/api/storage).
- Host e content script somente em `https://web.whatsapp.com/*`, sem cookies, debugger, acesso global ou código remoto. A listagem de abas usa o acesso a esse host.
- [Mensageria oficial](https://developer.chrome.com/docs/extensions/develop/concepts/messaging): aceita somente painel empacotado ou content script próprio no frame principal, aba e tentativa autorizadas. Sem ponte `window.postMessage`.
- Bibliotecas: [libphonenumber-js](https://gitlab.com/catamphetamine/libphonenumber-js), [CSV Parse](https://csv.js.org/parse/), [read-excel-file](https://github.com/catamphetamine/read-excel-file).

## Limitações

O navegador e a aba autenticada precisam estar disponíveis. Mudanças no WhatsApp
podem exigir manutenção. Não há garantia de entrega, funcionamento contínuo nem
ausência de restrições. Use somente com contatos que autorizaram comunicação e
respeite exclusões. Projeto independente, não oficial do WhatsApp/Meta.

Anexos, grupos, agendamento futuro, respostas automáticas e múltiplas contas ficam
fora do MVP. Não existem recursos de evasão ou rotação de contas.
