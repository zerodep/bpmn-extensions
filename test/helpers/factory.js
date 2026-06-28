import BpmnModdle from 'bpmn-moddle';
import schema from 'zeebe-bpmn-moddle/resources/zeebe.json' with { type: 'json' };

/**
 * Author BPMN flows programmatically with bpmn-moddle and export them to XML.
 *
 * @example
 * const xml = await new ProcessBuilder('orders')
 *   .startEvent('start')
 *   .serviceTask('charge', { jobType: 'charge-card', io: { output: [{ source: '= ok', target: 'charged' }] } })
 *   .endEvent('end')
 *   .connect('start', 'charge')
 *   .connect('charge', 'end')
 *   .toXML();
 */
export class ProcessBuilder {
  constructor(id = 'process', { documentation } = {}) {
    this.moddle = new BpmnModdle({ zeebe: schema });
    this.id = id;
    this.documentation = documentation;
    this.flowElements = [];
  }

  #documentation(text) {
    return [this.moddle.create('bpmn:Documentation', { text })];
  }

  #add(element) {
    this.flowElements.push(element);
    return this;
  }

  #extensionElements(values) {
    if (!values.length) return undefined;
    return this.moddle.create('bpmn:ExtensionElements', { values });
  }

  #buildExtensions({ jobType, retries, io, headers, properties, assignment, executionListeners, script, calledDecision, form, userTask }) {
    const m = this.moddle;
    const values = [];
    if (userTask) values.push(m.create('zeebe:UserTask', {}));
    if (jobType !== undefined) values.push(m.create('zeebe:TaskDefinition', { type: jobType, retries }));
    if (script) values.push(m.create('zeebe:Script', { expression: script.expression, resultVariable: script.resultVariable }));
    if (calledDecision) values.push(m.create('zeebe:CalledDecision', calledDecision));
    if (form) values.push(m.create('zeebe:FormDefinition', form));
    if (io) {
      values.push(
        m.create('zeebe:IoMapping', {
          inputParameters: (io.input || []).map((p) => m.create('zeebe:Input', { source: p.source, target: p.target })),
          outputParameters: (io.output || []).map((p) => m.create('zeebe:Output', { source: p.source, target: p.target })),
        })
      );
    }
    if (headers) {
      values.push(
        m.create('zeebe:TaskHeaders', {
          values: Object.entries(headers).map(([key, value]) => m.create('zeebe:Header', { key, value })),
        })
      );
    }
    if (properties) {
      values.push(
        m.create('zeebe:Properties', {
          properties: Object.entries(properties).map(([name, value]) => m.create('zeebe:Property', { name, value })),
        })
      );
    }
    if (assignment) values.push(m.create('zeebe:AssignmentDefinition', assignment));
    if (executionListeners) {
      values.push(
        m.create('zeebe:ExecutionListeners', {
          listeners: executionListeners.map((l) => m.create('zeebe:ExecutionListener', l)),
        })
      );
    }
    return this.#extensionElements(values);
  }

  startEvent(id = 'start') {
    return this.#add(this.moddle.create('bpmn:StartEvent', { id }));
  }

  endEvent(id = 'end') {
    return this.#add(this.moddle.create('bpmn:EndEvent', { id }));
  }

  task(type, id, config = {}) {
    const extensionElements = this.#buildExtensions(config);
    const attrs = { id };
    if (config.documentation) attrs.documentation = this.#documentation(config.documentation);
    if (extensionElements) attrs.extensionElements = extensionElements;
    return this.#add(this.moddle.create(type, attrs));
  }

  serviceTask(id, config = {}) {
    return this.task('bpmn:ServiceTask', id, config);
  }

  userTask(id, config = {}) {
    return this.task('bpmn:UserTask', id, config);
  }

  scriptTask(id, config = {}) {
    return this.task('bpmn:ScriptTask', id, config);
  }

  businessRuleTask(id, config = {}) {
    return this.task('bpmn:BusinessRuleTask', id, config);
  }

  exclusiveGateway(id) {
    return this.#add(this.moddle.create('bpmn:ExclusiveGateway', { id }));
  }

  parallelGateway(id) {
    return this.#add(this.moddle.create('bpmn:ParallelGateway', { id }));
  }

  /**
   * Connect two elements with a sequence flow. Pass a FEEL `condition` (e.g. `= total > 100`)
   * for conditional flows out of a gateway.
   */
  connect(sourceId, targetId, condition) {
    const id = `${sourceId}-${targetId}`;
    const attrs = { id, sourceRef: this.#ref(sourceId), targetRef: this.#ref(targetId) };
    if (condition) attrs.conditionExpression = this.moddle.create('bpmn:FormalExpression', { body: condition });
    const flow = this.moddle.create('bpmn:SequenceFlow', attrs);

    this.#wire(sourceId, 'outgoing', flow);
    this.#wire(targetId, 'incoming', flow);
    return this.#add(flow);
  }

  #ref(id) {
    return this.flowElements.find((el) => el.id === id);
  }

  #wire(id, direction, flow) {
    const el = this.#ref(id);
    if (!el) throw new Error(`element <${id}> not found`);
    el[direction] = el[direction] || [];
    el[direction].push(flow);
  }

  build() {
    const process = this.moddle.create('bpmn:Process', {
      id: this.id,
      isExecutable: true,
      ...(this.documentation && { documentation: this.#documentation(this.documentation) }),
      flowElements: this.flowElements,
    });
    return this.moddle.create('bpmn:Definitions', {
      id: `${this.id}-definitions`,
      targetNamespace: 'http://bpmn.io/schema/bpmn',
      rootElements: [process],
    });
  }

  async toXML() {
    const { xml } = await this.moddle.toXML(this.build(), { format: true });
    return xml;
  }
}
