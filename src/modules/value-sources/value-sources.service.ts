import type { Notifier } from "@/modules/notifications";
import { NotFoundError } from "@/shared/errors";
import type { ValueSourcesRepository } from "./value-sources.repository";
import { DEFAULT_VALUE_SOURCE, type ValueSourceDto, type ValueSourceInput } from "./value-sources.schemas";

export function createValueSourcesService(deps: { repository: ValueSourcesRepository; notifier: Notifier }) {
  const { repository, notifier } = deps;

  async function get(userId: string, id: string): Promise<ValueSourceDto> {
    const found = await repository.findById(userId, id);
    if (!found) throw new NotFoundError("Conta");
    return found;
  }

  return {
    list: (userId: string) => repository.listByUser(userId),

    get,

    /** Sem lançar: usado por outros módulos para validar `valueSourceId` do corpo (400, não 404). */
    find: (userId: string, id: string) => repository.findById(userId, id),

    async create(userId: string, input: ValueSourceInput): Promise<ValueSourceDto> {
      const id = await repository.insert(userId, input);
      await notifier.notify(userId, { type: "sistema", title: "Conta criada", message: input.name });
      return get(userId, id);
    },

    /** PUT: inclui ativar/desativar. Sem DELETE no MVP (docs/07). */
    async update(userId: string, id: string, input: ValueSourceInput): Promise<ValueSourceDto> {
      if (!(await repository.update(userId, id, input))) throw new NotFoundError("Conta");
      return get(userId, id);
    },

    createDefaults(userId: string): Promise<void> {
      return repository.insertIfMissing(userId, DEFAULT_VALUE_SOURCE);
    },
  };
}

export type ValueSourcesService = ReturnType<typeof createValueSourcesService>;
