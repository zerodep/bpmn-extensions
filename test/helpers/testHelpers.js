import Debug from 'debug';
import BpmnModdle from 'bpmn-moddle';
import * as elements from 'bpmn-elements';
import { Serializer, TypeResolver } from 'moddle-context-serializer';
import schema from 'zeebe-bpmn-moddle/resources/zeebe.json' with { type: 'json' };

import { extensions, extendFn, FeelExpressions, FeelScripts } from '../../src/index.js';

const typeResolver = TypeResolver(elements);

/**
 * A bpmn-elements logger factory wired to the `debug` package, so the engine and the extensions
 * are observable under e.g. `DEBUG=bpmn-extensions:*` / `DEBUG=bpmn-extensions:error:*`.
 * @param {string} scope
 */
function Logger(scope) {
  return {
    debug: Debug('bpmn:' + scope),
    error: Debug('bpmn:error:' + scope),
    warn: Debug('bpmn:warn:' + scope),
  };
}

/**
 * Parse BPMN source (with the extension elements) into a bpmn-moddle context.
 * @param {string|Buffer} source
 */
export function getModdleContext(source) {
  const moddle = new BpmnModdle({ zeebe: schema });
  return moddle.fromXML(Buffer.isBuffer(source) ? source.toString() : source.trim());
}

/**
 * Build a serialized, FEEL- and extension-aware definition context from BPMN source.
 * @param {string|Buffer} source
 */
export async function getSerializer(source) {
  const moddleContext = await getModdleContext(source);
  moddleContext.warnings.forEach(({ error, message, element, property }) => {
    const logger = Logger('bpmn-moddle');
    if (error) return logger.error(message);
    logger.error(`<${element.id}> ${property}:`, message);
  });
  return Serializer(moddleContext, typeResolver, extendFn);
}

/**
 * Create a runnable bpmn-elements Definition from BPMN source, wired with the FEEL
 * expression language and the flow extensions.
 * @param {string|Buffer} source
 * @param {import('bpmn-elements').EnvironmentOptions} [options] services, variables, settings, ...
 */
export async function createDefinition(source, options = {}) {
  const serializer = await getSerializer(source);
  const context = elements.Context(serializer);
  return new elements.Definition(context, {
    expressions: FeelExpressions(),
    scripts: FeelScripts(),
    Logger,
    extensions: { flowExtensions: extensions },
    ...options,
  });
}

/**
 * Run a definition to completion, resolving once it leaves or errors.
 * @param {import('bpmn-elements').Definition} definition
 * @returns {Promise<import('bpmn-elements').Definition>}
 */
export function run(definition) {
  return new Promise((resolve, reject) => {
    definition.once('leave', () => resolve(definition));
    definition.once('error', reject);
    definition.run((err) => {
      if (err) reject(err);
    });
  });
}

/**
 * Convenience: create a definition from source and run it to completion.
 * @param {string|Buffer} source
 * @param {import('bpmn-elements').EnvironmentOptions} [options]
 */
export async function execute(source, options) {
  const definition = await createDefinition(source, options);
  return run(definition);
}
