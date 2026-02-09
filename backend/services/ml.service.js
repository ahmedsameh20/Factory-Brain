exports.predict = async (data) => {
  return {
    failure: Math.random() > 0.7 ? 1 : 0,
    failure_probability: Math.random().toFixed(2)
  };
};
