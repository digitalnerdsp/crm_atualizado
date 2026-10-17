import db from "../../database";
import { seedDefaultPipeline } from "../pipeline/controllers/create-pipeline";
import { seedDefaultLostReasons } from "../pipeline/controllers/lost-reasons";
import { seedDefaultSources } from "../taxonomy/controllers/taxonomy";

/** O `db` ou uma transação aberta. */
type Executor = Pick<typeof db, "select" | "insert">;

/**
 * Tudo que um workspace precisa para o CRM funcionar no primeiro dia: um funil
 * com etapas, as origens e as razões de perda. Sem o funil o board não abre;
 * sem razão de perda nenhum negócio pode ser perdido; sem origem ninguém
 * preenche de onde o cliente veio.
 *
 * Três caminhos criam workspace — o cadastro (hook do Better Auth), a
 * configuração inicial da instância e o painel de admin — e os três chamam
 * esta função, dentro da mesma transação que grava os papéis quando há uma.
 * Cada passo só semeia o que falta, então rodar de novo é inofensivo.
 */
export async function seedCrmDefaults(
  workspaceId: string,
  executor: Executor = db,
) {
  await seedDefaultPipeline(workspaceId, executor);
  await seedDefaultSources(workspaceId, executor);
  await seedDefaultLostReasons(workspaceId, executor);
}
