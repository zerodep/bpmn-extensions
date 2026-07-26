declare module '@0dep/bpmn-extensions' {
	/**
	 * A flow extension activated by bpmn-elements around an element's run.
	 * */
	/**
	 * Flow extensions factory. Pass it to the engine via the environment `extensions` option.
	 * */
	export function extensions(element: import("bpmn-elements").Activity | import("bpmn-elements").Process, context: import("bpmn-elements").ContextInstance): FlowExtension;
	/**
	 * Behaviour extend function for moddle-context-serializer.
	 *
	 * Lifts extension data onto the places bpmn-elements expects to find it on the element
	 * behaviour: the call activity's called process id (`zeebe:calledElement`) and the multi-instance
	 * input collection/element (`zeebe:loopCharacteristics`).
	 * */
	export function extendFn(behaviour: any): void;
	/**
	 * A flow extension activated by bpmn-elements around an element's run.
	 */
	export type FlowExtension = {
		activate: (message: any) => void;
		deactivate: (message?: any) => void;
	};
	/**
	 * FEEL-aware expressions implementation for bpmn-elements.
	 *
	 * Plug it into the engine via the environment `expressions` option so that the whole
	 * definition resolves FEEL expressions (`= ...`) instead of the default
	 * `${...}` template expressions.
	 *
	 * */
	export function FeelExpressions(): import("bpmn-elements").IExpressions & {
		isExpression: (text: string) => boolean;
		hasExpression: (text: string) => boolean;
	};
	/**
	 * A bpmn-elements `scripts` implementation for script tasks.
	 *
	 * A script task carries a `zeebe:script` extension with a FEEL `expression` (and a
	 * `resultVariable`). There is no embedded script body and no `scriptFormat` attribute, so this
	 * registry ignores the script format and reads the expression straight off the element.
	 *
	 * Install it on the environment via the `scripts` option, alongside `FeelExpressions()`.
	 *
	 * */
	export function FeelScripts(): import("bpmn-elements").IScripts;
	/**
	 * `zeebe:taskDefinition`.
	 *
	 * A job worker subscribed to the task `type` executes the activity. Here the
	 * `type` is mapped to an environment service of the same name: the job worker is a service
	 * function `(executionMessage, callback) => void` registered under the job type.
	 *
	 * The service receives the task headers and resolved io input on the execution message
	 * content, and its result (the second callback argument) becomes the job variables that
	 * output mapping operates on.
	 *
	 * Bind the task type to use as the activity `Service`:
	 *   activity.behaviour.Service = JobService.bind(JobService, taskType);
	 */
	export function JobService(taskType: any, activity: any): JobService;
	export class JobService {
		/**
		 * `zeebe:taskDefinition`.
		 *
		 * A job worker subscribed to the task `type` executes the activity. Here the
		 * `type` is mapped to an environment service of the same name: the job worker is a service
		 * function `(executionMessage, callback) => void` registered under the job type.
		 *
		 * The service receives the task headers and resolved io input on the execution message
		 * content, and its result (the second callback argument) becomes the job variables that
		 * output mapping operates on.
		 *
		 * Bind the task type to use as the activity `Service`:
		 *   activity.behaviour.Service = JobService.bind(JobService, taskType);
		 */
		constructor(taskType: any, activity: any);
		type: string | undefined;
		taskType: any;
		activity: any;
		execute(executionMessage: any, callback: any): any;
	}
	/**
	 * Activity-level extensions.
	 *
	 * Formatting and io/listener side effects are injected through the activity's `format-run-q`
	 * queue so the activity waits for them (including async execution listeners) before
	 * proceeding — the same mechanism bpmn-elements uses for extension formatting.
	 */
	export class ElementExtensions {
		constructor(activity: any);
		activity: any;
		formatQ: any;
		extensions: {
			format: FormatActivity | FormatProcess;
			io?: IoMapping;
			headers?: TaskHeaders;
			properties?: Properties;
			listeners?: ExecutionListeners;
			form?: Form;
			loop?: LoopCharacteristics;
			script?: any;
			calledDecision?: any;
			Service?: Function;
		};
		activate(message: any): void;
		deactivate(): void;
		/** @internal Shared with SubProcessExtensions. */
		_onEnter(elementApi: any): Promise<void>;
		/** @internal Shared with SubProcessExtensions. */
		_onExecuted(elementApi: any): Promise<void>;
		/** @internal Shared with SubProcessExtensions. */
		_onListener(eventType: any, elementApi: any): Promise<void>;
		#private;
	}
	/**
	 * Process-level extensions. Formats the process on enter (documentation) and assigns
	 * the result to the process variables.
	 */
	export class ProcessExtensions {
		constructor(bp: any);
		process: any;
		extensions: {
			format: FormatActivity | FormatProcess;
			io?: IoMapping;
			headers?: TaskHeaders;
			properties?: Properties;
			listeners?: ExecutionListeners;
			form?: Form;
			loop?: LoopCharacteristics;
			script?: any;
			calledDecision?: any;
			Service?: Function;
		};
		activate(): void;
		deactivate(): void;
		#private;
	}
	/**
	 * Sub-process extensions.
	 *
	 * A sub-process shares its broker with the child activities it contains, so their
	 * `activity.*` events bubble through it. Subscribing with `activity.on(...)` (as a leaf
	 * element does) would therefore fire the extension handlers for every child and spam the
	 * sub-process format queue, stalling it. Instead, subscribe on the broker and filter to the
	 * sub-process's own id.
	 */
	export class SubProcessExtensions extends ElementExtensions {
		#private;
	}
	/**
	 * Is the value a FEEL expression, i.e. a string starting with `=`?
	 * */
	export function isFeelExpression(value: unknown): boolean;
	/**
	 * Strip the leading `=` from a FEEL expression.
	 * */
	export function stripFeel(expression: string): string;
	/**
	 * Evaluate a FEEL expression against a context (the variables in scope).
	 * @param expression FEEL expression, with or without the leading `=`
	 * @param context Variables in scope
	 * */
	export function evaluateFeel(expression: string, context?: Record<string, any>): any;
	/**
	 * Evaluate a FEEL unary test, e.g. `> 100` or `1, 2, 3`, against an input value.
	 * @param expression FEEL unary test
	 * @param input The value being tested, available as `?` in the test
	 * @param context Additional variables in scope
	 * @returns true only when the test is satisfied — an undecidable (null) test is false
	 */
	export function evaluateFeelUnaryTest(expression: string, input: any, context?: Record<string, any>): boolean;
	/**
	 * Resolve a value: evaluate it as FEEL when it starts with `=`, otherwise
	 * return the static literal untouched.
	 * @param context Variables in scope for FEEL evaluation
	 * */
	export function resolveValue(value: any, context?: Record<string, any>): any;
	export class ServiceError extends Error {
		constructor(jobType: any);
		code: string;
		output: {
			statusCode: number;
		};
	}
	export class FormatError extends Error {
		constructor(elementId: any, err: any);
		code: string;
		output: {
			statusCode: number;
		};
	}
	/**
	 * Format an activity on enter from its behaviour and extensions: documentation and,
	 * for user tasks, the `zeebe:assignmentDefinition` (assignee, candidate users/groups).
	 */
	class FormatActivity {
		constructor(activity: any, assignmentDefinition: any);
		activity: any;
		assignmentDefinition: any;
		resolve(elementApi: any): {
			description: any;
			assignee: any;
			candidateUsers: any[];
			candidateGroups: any[];
		};
	}
	/**
	 * Format a process on enter: documentation.
	 */
	class FormatProcess {
		constructor(bp: any);
		process: any;
		resolve(elementApi: any): {
			description: any;
		};
	}
	/**
	 * `zeebe:ioMapping`.
	 *
	 * Input parameters are evaluated in the parent (process) scope when the element is entered,
	 * producing the local variables the job runs with. Output parameters are evaluated in the
	 * job-result scope when the element completes, merging the result back into the process
	 * variables.
	 *
	 * Each parameter has a `source` (a FEEL expression or static value) and a `target`
	 * (a, possibly dotted, variable name).
	 */
	class IoMapping {
		constructor(activity: any, ioMapping: any);
		activity: any;
		inputParameters: any;
		outputParameters: any;
		get hasInput(): boolean;
		get hasOutput(): boolean;
		/**
		 * Resolve input parameters against the current process variables.
		 * */
		getInput(elementApi: import("bpmn-elements").IApi<any>): {};
		/**
		 * Resolve output parameters against the job result overlaid on the process variables.
		 * @param jobResult Variables produced by the job
		 */
		getOutput(elementApi: import("bpmn-elements").IApi<any>, jobResult?: Record<string, any>): {};
	}
	/**
	 * `zeebe:taskHeaders`.
	 *
	 * Static key/value metadata passed to the job worker. Resolved to a plain object and made
	 * available on the element content as `headers`.
	 */
	class TaskHeaders {
		constructor(taskHeaders: any);
		values: any;
		resolve(): {};
	}
	/**
	 * `zeebe:properties`.
	 *
	 * Named properties whose values may be FEEL expressions. Resolved to a plain object and made
	 * available on the element content as `properties`.
	 */
	class Properties {
		constructor(properties: any);
		properties: any;
		resolve(elementApi: any): {};
	}
	/**
	 * `zeebe:executionListeners`.
	 *
	 * Each listener invokes a job worker (an environment service named by the listener `type`)
	 * either before the element runs (`eventType: "start"`) or after it completes
	 * (`eventType: "end"`). A listener is called as `(elementApi, { retries, headers }, callback)` and
	 * may either call the callback or return a promise — either way the element blocks until it
	 * settles. `retries` and `headers` are only present when the listener declares them (no defaults
	 * are invented).
	 */
	class ExecutionListeners {
		constructor(activity: any, executionListeners: any);
		activity: any;
		listeners: any;
		get onStart(): any;
		get onEnd(): any;
		/**
		 * Execute all listeners registered for an event type, in order.
		 * */
		execute(eventType: "start" | "end", elementApi: import("bpmn-elements").IApi<any>): Promise<void>;
	}
	/**
	 * `zeebe:formDefinition`.
	 *
	 * User tasks (and form-bearing start events) reference their form here: a linked
	 * form (`formId`), a deprecated form key (`formKey`), or an external form
	 * (`externalReference`, which may be a FEEL expression). Resolved to a plain object and made
	 * available on the element content as `form` so a task list can render it.
	 */
	class Form {
		constructor(formDefinition: any);
		formDefinition: any;
		resolve(elementApi: any): {
			versionTag?: any;
			bindingType?: any;
			externalReference?: any;
			formKey?: any;
			formId?: any;
		};
	}
	/**
	 * Output side of `zeebe:loopCharacteristics`.
	 *
	 * A multi-instance is aggregated into an `outputCollection` array: for each instance the
	 * `outputElement` FEEL expression is evaluated in that instance's result scope and collected, in
	 * input order, into the named collection variable.
	 *
	 * bpmn-elements collects instance outputs into an index-keyed object on the activity content
	 * (`{ 0: <out>, 1: <out>, ... }`, where a call activity instance wraps its result as
	 * `{ executionId, output }`). This reduces that to the output-collection array.
	 */
	class LoopCharacteristics {
		constructor(loopCharacteristics: any);
		outputCollection: any;
		outputElement: any;
		get hasOutputCollection(): boolean;
		/**
		 * @param indexedOutput bpmn-elements index-keyed instance outputs
		 * @param baseScope process variables in scope for `outputElement`
		 * */
		aggregate(indexedOutput: Record<string, any> | undefined, baseScope: Record<string, any>): any[];
	}

	export {};
}

//# sourceMappingURL=index.d.ts.map