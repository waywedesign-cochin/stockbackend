import express from 'express'
import { switchBatch } from '../controllers/batchHistoryController.js'

const router=express.Router()

router.post("/switch-batch",switchBatch)

export default router