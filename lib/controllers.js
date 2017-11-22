module.exports = function container(get) {
  let c = get('conf');

  return {
    initialize: function (engine, s) {
      if (c.debug) {
        console.log('Initializing controllers');
      }

      for (let controller in c.controllers) {
        if (c.controllers[controller].on) {
          if (c.debug) {
            console.log(`Initializing remote controller ${controller}`);
          }

          get(`controllers.${controller}`).initialize(c.controllers[controller], engine, s);
        }
      }
    }
  };
};
