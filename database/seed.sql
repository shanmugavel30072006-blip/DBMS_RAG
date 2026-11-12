-- ============================================================================
-- Spacecraft Engineering Knowledge Management & Intelligent Retrieval System
-- Master Seed Dataset
-- ============================================================================

-- 1. Insert System Users (Placeholder hashes replaced with secure scrypt hashes by seed-db.mjs)
INSERT INTO users (user_id, username, full_name, email, department, password_hash)
VALUES
(1, 'admin', 'Administrator', 'admin@astrorag.local', 'Administration', 'uninitialized'),
(2, 'user', 'User', 'user@astrorag.local', 'Engineering', 'uninitialized')
ON CONFLICT (user_id) DO NOTHING;

SELECT setval('users_user_id_seq', (SELECT MAX(user_id) FROM users));

-- 2. Insert Spacecraft Missions
INSERT INTO spacecraft_missions (mission_id, mission_code, mission_name, target_body, launch_date, status, agency, budget_millions, description)
VALUES
(1, 'ARTEMIS-III', 'Artemis III Crewed Lunar Landing', 'Lunar South Pole (Shackleton Rim)', '2027-09-15', 'ACTIVE', 'NASA / ESA / JAXA', 4100.00, 'First human landing on the lunar South Pole region targeting permanently shadowed craters for water ice extraction analysis.'),
(2, 'JWST-01', 'James Webb Space Telescope Deep Field', 'Sun-Earth L2 Lagrange Point', '2021-12-25', 'EXTENDED', 'NASA / ESA / CSA', 10000.00, 'Premier infrared space observatory conducting cosmological deep field surveys and exoplanet atmospheric spectroscopy.'),
(3, 'PERSEVERANCE-M20', 'Mars 2020 Astrobiology Rover', 'Jezero Crater, Mars', '2020-07-30', 'ACTIVE', 'NASA JPL', 2700.00, 'Surface rover investigating ancient lacustrine habitability, biosignatures, and cache core samples for future Mars Sample Return.'),
(4, 'CHANDRAYAAN-3', 'Vikram Lander & Pragyan Rover', 'Lunar South Pole Latitude 69.37°S', '2023-07-14', 'COMPLETED', 'ISRO', 75.00, 'Historic precision soft landing in the high-latitude lunar terrain with in-situ ChaSTE thermal probes and APXS elemental spectroscopy.'),
(5, 'ORION-EFT', 'Orion Multi-Purpose Crew Vehicle High Orbit Test', 'Distant Retrograde Orbit (DRO)', '2025-05-10', 'PLANNED', 'NASA / Lockheed Martin', 3200.00, 'High-apogee orbital stress test verifying the European Service Module (ESM) propellant management and reentry heat shield ablation.')
ON CONFLICT (mission_id) DO NOTHING;

SELECT setval('spacecraft_missions_mission_id_seq', (SELECT MAX(mission_id) FROM spacecraft_missions));

-- 3. Insert Spacecraft Engineering Subsystems
INSERT INTO subsystems (subsystem_id, code, name, category, lead_engineer_id, criticality_level, description)
VALUES
(1, 'PROP-01', 'Cryogenic & Hypergolic Propulsion Subsystem', 'PROPULSION', 2, 'MISSION_CRITICAL', 'Manages liquid hydrogen (LH2), liquid oxygen (LOX), reaction control system (RCS) pulse thrusters, propellant settling, and pressurization valves.'),
(2, 'AVN-02', 'Triple Modular Redundancy Flight Avionics', 'AVIONICS', 2, 'MISSION_CRITICAL', 'Radiation-hardened multi-core flight processors, 1553B/SpaceWire telemetry bus, redundant power distribution, and real-time execution kernels.'),
(3, 'THM-03', 'Active Loop & Multilayer Insulation Thermal Subsystem', 'THERMAL', 2, 'HIGH', 'Fluid loop heat rejection radiators, louvers, cryogenic sunshields, and passive MLI blankets maintaining operational temperatures from -230°C to +120°C.'),
(4, 'GNC-04', 'Guidance, Navigation & Star Tracker Cluster', 'GNC', 2, 'MISSION_CRITICAL', 'Autonomous attitude determination via dual star trackers, fiber-optic gyroscopes, inertial measurement units (IMUs), and fine reaction wheels.'),
(5, 'EPS-05', 'Gallium Arsenide Solar Arrays & EPS Energy Storage', 'POWER_EPS', 2, 'HIGH', 'Ultra-high efficiency solar wing deployment, Maximum Power Point Tracking (MPPT) regulators, and primary lithium-ion storage cells.'),
(6, 'COMM-06', 'Deep Space Ka/X-Band High Gain Antenna System', 'COMMUNICATIONS', 2, 'MEDIUM', 'Two-axis steerable reflector delivering telemetry downlink to the Deep Space Network (DSN) at 20+ Mbps through interplanetary distances.'),
(7, 'ECLSS-07', 'Closed-Loop Regenerative Life Support & Cabin Pressure', 'ECLSS', 1, 'MISSION_CRITICAL', 'CO2 removal amine beds, oxygen generation assemblies, cabin pressure regulators, and wastewater distillation loops for human survivability.')
ON CONFLICT (subsystem_id) DO NOTHING;

SELECT setval('subsystems_subsystem_id_seq', (SELECT MAX(subsystem_id) FROM subsystems));

-- 4. Insert Technical Documents (Manuals, Anomaly Reports, Telemetry Specs)
INSERT INTO engineering_documents (document_id, mission_id, subsystem_id, title, doc_type, file_name, file_size_kb, version, uploaded_by, status, chunk_count)
VALUES
(1, 1, 1, 'Cryogenic Boil-Off Mitigation & LOX Tank Pressure Control', 'FLIGHT_MANUAL', 'artemis3_prop_lox_boiloff_v2.pdf', 3420, 'v2.4.1', 1, 'INDEXED', 4),
(2, 1, 4, 'Autonomous Lunar Descent Hazard Detection & Star Tracker Lost-in-Space Logic', 'DESIGN_REQUIREMENT', 'artemis3_gnc_hazard_avoidance.pdf', 5120, 'v3.1.0', 1, 'INDEXED', 3),
(3, 2, 3, 'Deployable Five-Layer Kapton Sunshield Thermal Margin Specifications', 'TELEMETRY_SPEC', 'jwst_sunshield_thermal_margin_rev4.pdf', 8400, 'v4.0.0', 2, 'INDEXED', 3),
(4, 3, 1, 'Mars Entry, Descent, and Landing (EDL) Retro-Rocket Pulse Balancing Anomaly Post-Mortem', 'FAILURE_ANALYSIS', 'm2020_edl_skycrane_retro_anomaly.pdf', 2890, 'v1.2.0', 1, 'INDEXED', 3),
(5, 4, 3, 'ChaSTE High-Latitude Lunar Regolith Thermal Conductivity Observations', 'TELEMETRY_SPEC', 'ch3_chaste_thermal_data_analysis.pdf', 1940, 'v1.0.0', 2, 'INDEXED', 2),
(6, 1, 2, 'Single-Event Upset (SEU) Handling in Critical Flight Computer Memory Bus', 'STANDARD_PROCEDURE', 'orion_avionics_seu_mitigation.pdf', 4310, 'v2.0.1', 1, 'INDEXED', 3)
ON CONFLICT (document_id) DO NOTHING;

SELECT setval('engineering_documents_document_id_seq', (SELECT MAX(document_id) FROM engineering_documents));

-- 5. Insert Document Chunks with Text and Embeddings
-- (For standard vector operations, these chunks represent deep technical content for RAG)
INSERT INTO document_chunks (chunk_id, document_id, chunk_index, token_count, chunk_text, metadata)
VALUES
('00000000-0000-0000-0000-000000000001', 1, 1, 142, 
'In the Artemis III Main Propulsion Subsystem (PROP-01), cryogenic liquid oxygen (LOX) boil-off in the service module propellant tanks is actively regulated via the Thermodynamic Vent System (TVS). When the LOX ullage pressure exceeds 245 kPa, the primary Joule-Thomson expansion valve initiates micro-cooling recirculation through the internal spray header to de-stratify liquid layers.',
'{"subsystem": "PROP-01", "mission": "ARTEMIS-III", "page": 14, "topic": "LOX Boil-off"}'::jsonb),

('00000000-0000-0000-0000-000000000002', 1, 2, 168, 
'Emergency venting contingency protocol for Cryogenic Tanks: If tank pressure reaches the redline limit of 278 kPa due to TVS pump failure, the burst disk relief valve (BDRV-2) is mechanically bypassed by the flight computer executing Command Sequence PROP_VENT_OVERRIDE. Ground control telemetry must confirm valve seat closure within 4.2 seconds to prevent excessive delta-V perturbance.',
'{"subsystem": "PROP-01", "mission": "ARTEMIS-III", "page": 16, "topic": "Pressure Relief"}'::jsonb),

('00000000-0000-0000-0000-000000000003', 2, 1, 155, 
'The Autonomous Hazard Detection and Avoidance (HDA) algorithm in GNC-04 computes real-time digital elevation models (DEM) from flash LiDAR range-maps during lunar terminal descent at altitudes between 500m and 30m. Craters exceeding 0.4 meters in depth or slopes steeper than 8 degrees automatically trigger an autonomous divert maneuver via RCS thruster quad banks.',
'{"subsystem": "GNC-04", "mission": "ARTEMIS-III", "page": 42, "topic": "Hazard Avoidance"}'::jsonb),

('00000000-0000-0000-0000-000000000004', 2, 2, 172, 
'Star Tracker Lost-in-Space (LIS) Recovery: In the event of dual star tracker blinded conditions due to thruster plume contamination or solar glare exceeding 30 degrees off boresight, the GNC system enters dead-reckoning mode using the Honeywell Fiber Optic Gyroscope (FOG) cluster. The attitude drift rate is bounded by 0.005 degrees per hour for up to 180 seconds until star pattern acquisition is restored.',
'{"subsystem": "GNC-04", "mission": "ARTEMIS-III", "page": 58, "topic": "Star Tracker LIS"}'::jsonb),

('00000000-0000-0000-0000-000000000005', 3, 1, 148, 
'The James Webb Space Telescope five-layer Kapton sunshield attenuates solar radiation flux from approximately 200,000 Watts on the hot side (facing the Sun, reaching +85°C / 358 K) down to less than 1 Watt on the cold science instrument module side (-233°C / 40 K). Layer 1 and 2 utilize vapor-deposited aluminum coating with silicon doping to resist degradation from micrometeoroid impacts.',
'{"subsystem": "THM-03", "mission": "JWST-01", "page": 8, "topic": "Sunshield Cryogenics"}'::jsonb),

('00000000-0000-0000-0000-000000000006', 4, 1, 160, 
'Mars 2020 Sky Crane Retro-Rocket Anomaly Analysis: During terminal powered descent stage ignition at 2100m AGL, differential chamber pressure oscillations of +/- 6.8% were observed on Mars Lander Engine MLE-3. The root cause was identified as cryogenic helium entrapment inside the cavitating venturi inlet during rapid throttle valve ramping from 20% to 80% thrust command.',
'{"subsystem": "PROP-01", "mission": "PERSEVERANCE-M20", "page": 5, "topic": "Sky Crane Anomaly"}'::jsonb),

('00000000-0000-0000-0000-000000000007', 5, 1, 135, 
'ChaSTE payload telemetry revealed an unprecedented thermal gradient in the lunar regolith at 69.37°S latitude. The surface temperature hovered around 50°C during lunar noon, but plunged to -10°C just 8 centimeters below the lunar surface, establishing that lunar soil acts as an extraordinary natural thermal insulator for future lunar base habitats.',
'{"subsystem": "THM-03", "mission": "CHANDRAYAAN-3", "page": 3, "topic": "Lunar Regolith Thermal"}'::jsonb),

('00000000-0000-0000-0000-000000000008', 6, 1, 150, 
'Flight Avionics Single-Event Upset (SEU) Handling: When cosmic radiation induces a bit-flip in the BAE RAD750 flight processor cache, the Triple Modular Redundant (TMR) voting logic flags a discrepancy register. If two of the three independent compute channels agree, the erroneous channel state is overwritten within a single clock cycle without interrupting flight-critical guidance loops.',
'{"subsystem": "AVN-02", "mission": "ARTEMIS-III", "page": 22, "topic": "Avionics SEU TMR"}'::jsonb)
ON CONFLICT (chunk_id) DO NOTHING;

-- Keep stored counts consistent with the chunks actually seeded.
UPDATE engineering_documents d
SET chunk_count = (SELECT COUNT(*) FROM document_chunks c WHERE c.document_id = d.document_id);

-- 6. Insert Historical Anomalies & In-Flight Incidents
INSERT INTO anomalies_incidents (anomaly_id, anomaly_code, mission_id, subsystem_id, document_id, title, severity, status, telemetry_timestamp, root_cause, mitigation_action, reported_by, resolved_by)
VALUES
(1, 'ANM-PROP-2025-01', 1, 1, 1, 'Cryogenic TVS Joule-Thomson Valve Flow Stoppage', 'SEVERE', 'RESOLVED', '2025-04-12 18:34:00+00', 'Particulate freezing in expansion orifice during transition to low-gravity liquid settling phase.', 'Executed pulsed reverse backflush cycle with redundant heater circuit; updated software keep-warm cycle from 60s to 45s.', 2, 1),
(2, 'ANM-GNC-2026-03', 1, 4, 2, 'Star Tracker Optical Bloom During RCS Null-Divert', 'MODERATE', 'MITIGATED', '2026-02-18 09:12:30+00', 'Unburned hydrazine droplets entering star tracker sunshade field of view during high-frequency pulse mode.', 'Adjusted star tracker exclusion angles; enabled inertial propagation lock during rapid attitude maneuvers.', 2, 1),
(3, 'ANM-THM-2022-09', 2, 3, 3, 'Layer-3 Sunshield Tensioner Micro-Slip Discrepancy', 'LOW', 'CLOSED', '2022-01-08 14:00:00+00', 'Thermal contraction of nitinol deployment cable during shadow transit causing minor 1.2mm tension relaxation.', 'Accepted as within structural safety factor; verified steady-state cold-side temperature maintained below 39.5 K.', 2, 2),
(4, 'ANM-AVN-2026-07', 1, 2, 6, 'Single Event Latch-Up on SpaceWire Router Port 4', 'SEVERE', 'INVESTIGATING', '2026-06-19 22:45:11+00', 'High-energy solar particle event caused non-destructive latchup condition on the telemetry multiplexer.', 'Power-cycled auxiliary router card; diverted science telemetry stream to redundant Bus B while investigating shielding upgrade.', 2, NULL),
(5, 'ANM-PROP-2021-02', 3, 1, 4, 'Descent Stage MLE-3 Cavitation Induced Thrust Oscillation', 'CATASTROPHIC', 'RESOLVED', '2021-02-18 20:53:10+00', 'Helium micro-bubbles trapped in fuel line during terminal throttle down at 30% Sky Crane load.', 'Redesigned intake bubble trap screen and implemented pre-ignition helium de-aeration dwell sequence.', 2, 1)
ON CONFLICT (anomaly_id) DO NOTHING;

SELECT setval('anomalies_incidents_anomaly_id_seq', (SELECT MAX(anomaly_id) FROM anomalies_incidents));

-- 7. Insert Audit Logs
INSERT INTO audit_logs (log_id, action_type, entity_type, entity_id, user_id, details, timestamp)
VALUES
(1, 'SYSTEM_BOOT', 'database', 'spacecraft_db', 1, '{"status": "INITIALIZED", "vector_extension": "pgvector 0.7+", "relational_schema": "v3.0"}'::jsonb, CURRENT_TIMESTAMP - INTERVAL '48 hours'),
(2, 'DOCUMENT_INGESTION', 'engineering_documents', '1', 1, '{"file": "artemis3_prop_lox_boiloff_v2.pdf", "chunks_indexed": 4, "subsystem": "PROP-01"}'::jsonb, CURRENT_TIMESTAMP - INTERVAL '36 hours'),
(3, 'ANOMALY_LOGGED', 'anomalies_incidents', '1', 2, '{"code": "ANM-PROP-2025-01", "severity": "SEVERE"}'::jsonb, CURRENT_TIMESTAMP - INTERVAL '24 hours'),
(4, 'DOCUMENT_INGESTION', 'engineering_documents', '2', 1, '{"file": "artemis3_gnc_hazard_avoidance.pdf", "chunks_indexed": 3, "subsystem": "GNC-04"}'::jsonb, CURRENT_TIMESTAMP - INTERVAL '12 hours')
ON CONFLICT (log_id) DO NOTHING;

SELECT setval('audit_logs_log_id_seq', (SELECT MAX(log_id) FROM audit_logs));

