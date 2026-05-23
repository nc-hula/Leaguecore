"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const express_session_1 = __importDefault(require("express-session"));
const connect_pg_simple_1 = __importDefault(require("connect-pg-simple"));
const db_1 = require("./db");
const passport_1 = __importDefault(require("./auth/passport"));
const router_1 = __importDefault(require("./auth/router"));
const router_2 = __importDefault(require("./api/router"));
const app = (0, express_1.default)();
// Body parsing middleware
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
// Session store backed by PostgreSQL
const PgSession = (0, connect_pg_simple_1.default)(express_session_1.default);
app.use((0, express_session_1.default)({
    store: new PgSession({
        pool: db_1.pool,
        tableName: 'session',
        createTableIfMissing: true,
    }),
    secret: process.env.SESSION_SECRET ?? 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
    },
}));
// Passport authentication middleware
app.use(passport_1.default.initialize());
app.use(passport_1.default.session());
// Routers
app.use('/auth', router_1.default);
app.use('/api', router_2.default);
exports.default = app;
//# sourceMappingURL=app.js.map