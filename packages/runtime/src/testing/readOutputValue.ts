import { StatefulObservable } from '@rx-evo/stateful-observable';
import { firstValueFrom } from 'rxjs';

export async function readOutputValue(
	output: StatefulObservable<unknown, unknown>,
): Promise<unknown> {
	return firstValueFrom(output.value$);
}
