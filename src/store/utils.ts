export function numberfyProperty(property: PropertyKey) {
  if (typeof property === "string") {
    const number = Number(property);
    if (Number.isInteger(number)) {
      return number;
    }
  }
  return property;
}

export function bindAllFunctions(target: Object) {
  const propertiesToSkip = new Set<string>(["constructor"]);

  let current = target;

  do {
    const propertyDescriptors = Object.getOwnPropertyDescriptors(current);
    for (const property in propertyDescriptors) {
      if (propertiesToSkip.has(property)) continue;

      const propertyDescriptor = propertyDescriptors[property];
      if (typeof propertyDescriptor.value === "function") {
        Object.defineProperty(target, property, {
          ...propertyDescriptor,
          value: propertyDescriptor.value.bind(target),
        });
        propertiesToSkip.add(property);
      }
    }
    current = Object.getPrototypeOf(current);
  } while (current && current !== Object.prototype);
}
