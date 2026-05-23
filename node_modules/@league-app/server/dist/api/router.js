"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const router_1 = __importDefault(require("./leagues/router"));
const router_2 = __importDefault(require("./rounds/router"));
const router = (0, express_1.Router)();
router.use('/leagues', router_1.default);
router.use('/leagues/:leagueId/rounds', router_2.default);
exports.default = router;
//# sourceMappingURL=router.js.map