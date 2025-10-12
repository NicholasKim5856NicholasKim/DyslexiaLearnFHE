// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract DyslexiaLearnFHE is SepoliaConfig {
    struct EncryptedLearningData {
        uint256 id;
        euint32 encryptedActivityLog;
        euint32 encryptedPerformance;
        euint32 encryptedStudentId;
        uint256 timestamp;
    }
    
    struct DecryptedLearningData {
        string activityLog;
        uint256 performance;
        string studentId;
        bool isAnalyzed;
    }

    uint256 public dataCount;
    mapping(uint256 => EncryptedLearningData) public encryptedData;
    mapping(uint256 => DecryptedLearningData) public decryptedData;
    
    mapping(string => euint32) private encryptedStudentStats;
    string[] private studentList;
    
    mapping(uint256 => uint256) private requestToDataId;
    
    event DataSubmitted(uint256 indexed id, uint256 timestamp);
    event AnalysisRequested(uint256 indexed id);
    event DataAnalyzed(uint256 indexed id);
    
    modifier onlyEducator(uint256 dataId) {
        _;
    }
    
    function submitEncryptedLearningData(
        euint32 encryptedActivityLog,
        euint32 encryptedPerformance,
        euint32 encryptedStudentId
    ) public {
        dataCount += 1;
        uint256 newId = dataCount;
        
        encryptedData[newId] = EncryptedLearningData({
            id: newId,
            encryptedActivityLog: encryptedActivityLog,
            encryptedPerformance: encryptedPerformance,
            encryptedStudentId: encryptedStudentId,
            timestamp: block.timestamp
        });
        
        decryptedData[newId] = DecryptedLearningData({
            activityLog: "",
            performance: 0,
            studentId: "",
            isAnalyzed: false
        });
        
        emit DataSubmitted(newId, block.timestamp);
    }
    
    function requestLearningAnalysis(uint256 dataId) public onlyEducator(dataId) {
        EncryptedLearningData storage ld = encryptedData[dataId];
        require(!decryptedData[dataId].isAnalyzed, "Already analyzed");
        
        bytes32[] memory ciphertexts = new bytes32[](3);
        ciphertexts[0] = FHE.toBytes32(ld.encryptedActivityLog);
        ciphertexts[1] = FHE.toBytes32(ld.encryptedPerformance);
        ciphertexts[2] = FHE.toBytes32(ld.encryptedStudentId);
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.analyzeLearning.selector);
        requestToDataId[reqId] = dataId;
        
        emit AnalysisRequested(dataId);
    }
    
    function analyzeLearning(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 dataId = requestToDataId[requestId];
        require(dataId != 0, "Invalid request");
        
        EncryptedLearningData storage eData = encryptedData[dataId];
        DecryptedLearningData storage dData = decryptedData[dataId];
        require(!dData.isAnalyzed, "Already analyzed");
        
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        (string memory activityLog, uint256 performance, string memory studentId) = 
            abi.decode(cleartexts, (string, uint256, string));
        
        dData.activityLog = activityLog;
        dData.performance = performance;
        dData.studentId = studentId;
        dData.isAnalyzed = true;
        
        if (FHE.isInitialized(encryptedStudentStats[dData.studentId]) == false) {
            encryptedStudentStats[dData.studentId] = FHE.asEuint32(0);
            studentList.push(dData.studentId);
        }
        encryptedStudentStats[dData.studentId] = FHE.add(
            encryptedStudentStats[dData.studentId], 
            FHE.asEuint32(1)
        );
        
        emit DataAnalyzed(dataId);
    }
    
    function getDecryptedLearningData(uint256 dataId) public view returns (
        string memory activityLog,
        uint256 performance,
        string memory studentId,
        bool isAnalyzed
    ) {
        DecryptedLearningData storage d = decryptedData[dataId];
        return (d.activityLog, d.performance, d.studentId, d.isAnalyzed);
    }
    
    function getEncryptedStudentStats(string memory studentId) public view returns (euint32) {
        return encryptedStudentStats[studentId];
    }
    
    function requestStudentStatsDecryption(string memory studentId) public {
        euint32 stats = encryptedStudentStats[studentId];
        require(FHE.isInitialized(stats), "Student not found");
        
        bytes32[] memory ciphertexts = new bytes32[](1);
        ciphertexts[0] = FHE.toBytes32(stats);
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptStudentStats.selector);
        requestToDataId[reqId] = bytes32ToUint(keccak256(abi.encodePacked(studentId)));
    }
    
    function decryptStudentStats(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 studentHash = requestToDataId[requestId];
        string memory studentId = getStudentFromHash(studentHash);
        
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        uint32 stats = abi.decode(cleartexts, (uint32));
    }
    
    function bytes32ToUint(bytes32 b) private pure returns (uint256) {
        return uint256(b);
    }
    
    function getStudentFromHash(uint256 hash) private view returns (string memory) {
        for (uint i = 0; i < studentList.length; i++) {
            if (bytes32ToUint(keccak256(abi.encodePacked(studentList[i]))) == hash) {
                return studentList[i];
            }
        }
        revert("Student not found");
    }
    
    function recommendLearningPath(
        string memory studentId,
        string[] memory availableActivities
    ) public view returns (string[] memory recommendedActivities) {
        uint256 count = 0;
        for (uint256 i = 1; i <= dataCount; i++) {
            if (decryptedData[i].isAnalyzed && 
                keccak256(abi.encodePacked(decryptedData[i].studentId)) == keccak256(abi.encodePacked(studentId))) {
                for (uint256 j = 0; j < availableActivities.length; j++) {
                    if (isActivitySuitable(decryptedData[i].activityLog, availableActivities[j])) {
                        count++;
                    }
                }
            }
        }
        
        recommendedActivities = new string[](count);
        uint256 index = 0;
        for (uint256 i = 1; i <= dataCount; i++) {
            if (decryptedData[i].isAnalyzed && 
                keccak256(abi.encodePacked(decryptedData[i].studentId)) == keccak256(abi.encodePacked(studentId))) {
                for (uint256 j = 0; j < availableActivities.length; j++) {
                    if (isActivitySuitable(decryptedData[i].activityLog, availableActivities[j])) {
                        recommendedActivities[index] = availableActivities[j];
                        index++;
                    }
                }
            }
        }
        return recommendedActivities;
    }
    
    function isActivitySuitable(
        string memory activityLog,
        string memory newActivity
    ) private pure returns (bool) {
        // Simplified suitability check
        // In real implementation, this would analyze learning patterns
        return true;
    }
    
    function calculateLearningProgress(
        string memory studentId
    ) public view returns (uint256 progressScore) {
        uint256 totalPerformance = 0;
        uint256 count = 0;
        
        for (uint256 i = 1; i <= dataCount; i++) {
            if (decryptedData[i].isAnalyzed && 
                keccak256(abi.encodePacked(decryptedData[i].studentId)) == keccak256(abi.encodePacked(studentId))) {
                totalPerformance += decryptedData[i].performance;
                count++;
            }
        }
        
        return count > 0 ? totalPerformance / count : 0;
    }
    
    function detectLearningPatterns(
        string memory studentId,
        string[] memory knownPatterns
    ) public view returns (string[] memory matchedPatterns) {
        uint256 count = 0;
        
        for (uint256 i = 1; i <= dataCount; i++) {
            if (decryptedData[i].isAnalyzed && 
                keccak256(abi.encodePacked(decryptedData[i].studentId)) == keccak256(abi.encodePacked(studentId))) {
                for (uint256 j = 0; j < knownPatterns.length; j++) {
                    if (containsPattern(decryptedData[i].activityLog, knownPatterns[j])) {
                        count++;
                    }
                }
            }
        }
        
        matchedPatterns = new string[](count);
        uint256 index = 0;
        for (uint256 i = 1; i <= dataCount; i++) {
            if (decryptedData[i].isAnalyzed && 
                keccak256(abi.encodePacked(decryptedData[i].studentId)) == keccak256(abi.encodePacked(studentId))) {
                for (uint256 j = 0; j < knownPatterns.length; j++) {
                    if (containsPattern(decryptedData[i].activityLog, knownPatterns[j])) {
                        matchedPatterns[index] = knownPatterns[j];
                        index++;
                    }
                }
            }
        }
        return matchedPatterns;
    }
    
    function containsPattern(
        string memory activityLog,
        string memory pattern
    ) private pure returns (bool) {
        // Simplified pattern detection
        return keccak256(abi.encodePacked(activityLog)) == keccak256(abi.encodePacked(pattern));
    }
}