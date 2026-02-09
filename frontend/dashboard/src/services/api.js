import axios from "axios";

const api = axios.create({
  baseURL: "http://localhost:3000/api"
});

export const predict = (data) => api.post("/predict", data);