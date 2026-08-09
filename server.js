const express = require("express");
const sql = require("mssql");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());

// Sert le fichier index.html (et tout autre fichier statique du dossier "public")
app.use(express.static(path.join(__dirname, "public")));

// ---------- Configuration des 3 bases ----------

const baseConfig = {
    user: "notregroupe",
    password: "Password@", // défini dans Azure App Service > Configuration > Variables d'application
    server: "coursinf4163.database.windows.net",
    options: {
        encrypt: true,
        trustServerCertificate: false
    }
};

const configTemperature = { ...baseConfig, database: "TemperatureDB" };
const configPollution = { ...baseConfig, database: "PollutionDB" };
const configPrecipitation = { ...baseConfig, database: "PrecipitationDB" };

let poolTemperature, poolPollution, poolPrecipitation;

async function getPools() {
    if (!poolTemperature) poolTemperature = await sql.connect(configTemperature);
    if (!poolPollution) poolPollution = new sql.ConnectionPool(configPollution);
    if (!poolPrecipitation) poolPrecipitation = new sql.ConnectionPool(configPrecipitation);

    if (!poolPollution.connected && !poolPollution.connecting) await poolPollution.connect();
    if (!poolPrecipitation.connected && !poolPrecipitation.connecting) await poolPrecipitation.connect();

    return { poolTemperature, poolPollution, poolPrecipitation };
}

// Exécute une procédure stockée et renvoie { sp, ok, col1, col2 }
async function runSp(pool, spName) {
    try {
        const result = await pool.request().execute(spName);
        const row = result.recordset && result.recordset[0];
        const values = row ? Object.values(row) : [];

        return {
            sp: spName,
            ok: true,
            col1: values.length > 0 ? values[0] : null,
            col2: values.length > 1 ? values[1] : null
        };
    } catch (err) {
        console.error(`Erreur sur ${spName} :`, err.message);
        return { sp: spName, ok: false, error: err.message };
    }
}

// ---------- Route unique qui exécute les 12 procédures ----------

app.get("/api/resultats", async (req, res) => {
    try {
        const pools = await getPools();

        const runSafe = async (pool, spName) => {
            try {
                return await runSp(pool, spName);
            } catch (e) {
                return { sp: spName, ok: false, error: e.message };
            }
        };

        const [
            spAnneeMoinsChaude,
            spAnneePlusChaude,
            spProvinceMoinsChaude,
            spProvincePlusChaude,
            spAnneeMoinsPollue,
            spAnneePlusPollue,
            spProvinceMoinsPollue,
            spProvincePlusPollue,
            spAnneeMoinsPluvieuse,
            spAnneePlusPluvieuse,
            spProvinceMoinsPluvieuse,
            spProvincePlusPluvieuse
        ] = await Promise.all([
            runSafe(pools.poolTemperature, "spAnneeMoinsChaude"),
            runSafe(pools.poolTemperature, "spAnneePlusChaude"),
            runSafe(pools.poolTemperature, "spProvinceMoinsChaude"),
            runSafe(pools.poolTemperature, "spProvincePlusChaude"),
            runSafe(pools.poolPollution, "spAnneeMoinsPollue"),
            runSafe(pools.poolPollution, "spAnneePlusPollue"),
            runSafe(pools.poolPollution, "spProvinceMoinsPollue"),
            runSafe(pools.poolPollution, "spProvincePlusPollue"),
            runSafe(pools.poolPrecipitation, "spAnneeMoinsPluvieuse"),
            runSafe(pools.poolPrecipitation, "spAnneePlusPluvieuse"),
            runSafe(pools.poolPrecipitation, "spProvinceMoinsPluvieuse"),
            runSafe(pools.poolPrecipitation, "spProvincePlusPluvieuse")
        ]);

        res.json({
            temperature: {
                spAnneeMoinsChaude,
                spAnneePlusChaude,
                spProvinceMoinsChaude,
                spProvincePlusChaude
            },
            pollution: {
                spAnneeMoinsPollue,
                spAnneePlusPollue,
                spProvinceMoinsPollue,
                spProvincePlusPollue
            },
            precipitation: {
                spAnneeMoinsPluvieuse,
                spAnneePlusPluvieuse,
                spProvinceMoinsPluvieuse,
                spProvincePlusPluvieuse
            }
        });

    } catch (err) {
        console.error("Erreur générale :", err);
        res.status(500).json({ erreur: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log("Serveur démarré sur le port " + PORT);
});