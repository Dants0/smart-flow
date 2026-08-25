"use client";

/**
 * Passo a passo de "não consigo conectar no Jira".
 *
 * O conteúdo vem de um caso real: o dev via "Jira exigiu CAPTCHA", destravava
 * pelo navegador e travava de novo em minutos — porque o board consulta o Jira
 * a cada 60s e cada tentativa recusada conta como login falhado. A ordem dos
 * passos abaixo importa: fechar o board vem PRIMEIRO, senão o resto não segura.
 */
export function JiraTroubleshooting() {
  return (
    <div className="flex flex-col gap-3">
      <p>
        A plataforma entra no Jira com <strong>seu</strong> usuário e senha (Basic Auth), a cada
        consulta. É por isso que os chamados que aparecem são os atribuídos a você — e é por isso
        que credencial errada aqui tem efeito na sua conta lá.
      </p>

      <p className="rounded-lg bg-zinc-100 px-3 py-2 dark:bg-zinc-800">
        Depois de salvar a senha, use <strong>Testar conexão</strong> (em Configurações → Minha
        conta) para saber na hora se funcionou, em vez de esperar o board consultar.
      </p>

      <section>
        <h5 className="mb-1 font-semibold text-zinc-800 dark:text-zinc-200">
          1. O básico, antes de tudo
        </h5>
        <ul className="list-disc space-y-1 pl-4">
          <li>
            Usuário e senha são os mesmos com que você entra no Jira pelo navegador — não é o
            e-mail, e não é a senha desta plataforma.
          </li>
          <li>
            Colou a senha? Confira se não veio <strong>espaço no fim</strong>. (Ao salvar, a
            plataforma remove espaços das pontas.)
          </li>
          <li>
            <strong>Trocou a senha no Jira recentemente?</strong> Regrave aqui. Enquanto não
            regravar, a plataforma segue tentando a antiga — e é isso que trava sua conta.
          </li>
          <li>
            A URL da instância é configuração de administrador, em Configurações → Jira. Se
            estiver errada, nenhuma credencial funciona.
          </li>
        </ul>
      </section>

      <section>
        <h5 className="mb-1 font-semibold text-zinc-800 dark:text-zinc-200">
          2. Apareceu &quot;o Jira exigiu CAPTCHA&quot;
        </h5>
        <p className="mb-1">
          Depois de algumas tentativas recusadas, o Jira Server arma um CAPTCHA e passa a negar a
          API <em>mesmo com a senha certa</em>. Faça nesta ordem:
        </p>
        <ol className="list-decimal space-y-1 pl-4">
          <li>
            <strong>Feche a aba do board.</strong> Ela consulta o Jira a cada minuto; enquanto
            estiver aberta, o destravamento não dura.
          </li>
          <li>
            No navegador, <strong>saia do Jira</strong> (logout de verdade) e entre de novo pela
            tela de login, <strong>resolvendo o CAPTCHA</strong>. Abrir o Jira já logado não
            resolve: sem passar pelo formulário, o contador de falhas não zera.
          </li>
          <li>Volte aqui e salve a senha novamente — isso libera as tentativas.</li>
          <li>Reabra o board.</li>
        </ol>
        <p className="mt-1 text-zinc-500 dark:text-zinc-400">
          Atalho, se você tem acesso de administrador no Jira: em Administração → Gerenciamento de
          usuários, a ação <strong>Reset Failed Login Count</strong> limpa o CAPTCHA na hora.
        </p>
      </section>

      <section>
        <h5 className="mb-1 font-semibold text-zinc-800 dark:text-zinc-200">
          3. Travou de novo logo depois
        </h5>
        <p>
          Sinal de que a senha guardada aqui não é a que o Jira aceita na API. Acontece com conta
          de rede/SSO, em que a senha do formulário web não vale para o Basic Auth. Nesse caso, o
          caminho é falar com quem administra o Jira de vocês.
        </p>
      </section>

      <section>
        <h5 className="mb-1 font-semibold text-zinc-800 dark:text-zinc-200">
          4. Conectou, mas não aparece chamado nenhum
        </h5>
        <p>
          Aí não é autenticação. Veja o <strong>Monitor de Recursos</strong> (status do Jira) e a
          consulta JQL em Configurações → Jira: por padrão ela traz só o que está atribuído a você
          nas colunas até Desenvolvimento — Revisão, Gerar Exe, Testes, Resolvidos, Homologação e
          Entregue ficam de fora. Chamado que já virou card, ou que você dispensou, não reaparece.
        </p>
      </section>
    </div>
  );
}
