import { Listener, Store, Piece, Events } from '@sapphire/framework';
import { blue, gray, green, magenta, magentaBright, white, yellow } from 'colorette';
import { registerAllVisualCommands } from '../lib/utils';

const dev = process.env.NODE_ENV !== 'production';

export class UserEvent extends Listener<typeof Events.ClientReady> {
	private readonly style = dev ? yellow : blue;

	public constructor(context: Listener.LoaderContext, options: Listener.Options) {
		super(context, {
			...options,
			once: true
		});
	}

	public async run() {
		this.printBanner();
		this.printStoreDebugInformation();
		await registerAllVisualCommands(
			this.container.client,
			// @ts-expect-error: convex is injected at runtime
			this.container['convex'],
			// @ts-expect-error: serverId is injected at runtime
			this.container['serverId']
		);
	}

	private printBanner() {
		const success = green('+');

		const llc = dev ? magentaBright : white;
		const blc = dev ? magenta : blue;

		const line01 = llc(' █ █   █ █ █   █ █   █   █');
		const line02 = llc(' █ █   █ █ █   █ █   █   █');
		const line03 = llc(' █ █   █ █ █   █ █   █   █');
		const line04 = llc(' █ █   █ █ █   █ █   █   █');
		const line05 = llc(' █ █   █ █ █   █ █   █   █');
		const line06 = llc(' █ █   █ █ █   █ █   █   █');
		const line07 = llc(' █ █   █ █ █   █ █   █   █');

		// Offset Pad
		const pad = ' '.repeat(7);

		console.log(
			String.raw`
${line01} ${pad}${blc('1.0.0')}
${line02} ${pad}[${success}] Gateway
${line03}
${line04} ${pad}${blc('<>/ DEVELOPMENT MODE')}
${line05}
${line06}
${line07}
			`.trim()
		);
	}

	private printStoreDebugInformation() {
		const { client, logger } = this.container;
		const stores = [...client.stores.values()];
		const last = stores.pop()!;

		for (const store of stores) logger.info(this.styleStore(store, false));
		logger.info(this.styleStore(last, true));
	}

	private styleStore(store: Store<Piece>, last: boolean) {
		return gray(`${last ? '└─' : '├─'} Loaded ${this.style(store.size.toString().padEnd(3, ' '))} ${store.name}.`);
	}
}
