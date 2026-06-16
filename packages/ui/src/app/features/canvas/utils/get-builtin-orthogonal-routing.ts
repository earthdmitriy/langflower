import type { EdgeRouting, NgDiagramService } from 'ng-diagram';

/**
 * ng-diagram keeps built-in routings on `flowCore.edgeRoutingManager`, but
 * neither the manager nor `getRouting` is a public runtime export. The service
 * getter is `protected` in typings; at runtime it is available after init.
 */
type DiagramServiceRoutingAccess = {
	readonly flowCore: {
		readonly edgeRoutingManager: {
			getRouting: (name: string) => EdgeRouting | undefined;
		};
	};
};

export const getBuiltinOrthogonalRouting = (
	diagramService: NgDiagramService,
): EdgeRouting => {
	const orthogonal = (
		diagramService as unknown as DiagramServiceRoutingAccess
	).flowCore.edgeRoutingManager.getRouting('orthogonal');
	if (orthogonal === undefined) {
		throw new Error('ng-diagram orthogonal routing is not registered');
	}
	return orthogonal;
};
