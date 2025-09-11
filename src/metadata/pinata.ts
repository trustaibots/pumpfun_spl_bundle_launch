import axios from 'axios';
import FormData from 'form-data';
import * as dotenv from 'dotenv';


dotenv.config();

const pinataJWT = process.env.PINATA_JWT;


const pinJSONToIPFS = async (jsonBody: any) => {
    const url = `https://api.pinata.cloud/pinning/pinJSONToIPFS`;

    const response = await axios.post(url, jsonBody, {
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${pinataJWT}`,
        },
    });
    
    return response.data.IpfsHash;
};

const pinFileToIPFS = async (path: string, stream: any) => {
    const formData = new FormData();

    formData.append('file', stream)

    try {
        const res = await axios.post("https://api.pinata.cloud/pinning/pinFileToIPFS", formData, {
            headers: {
                'Content-Type': `multipart/form-data`,
                'Authorization': `Bearer ${pinataJWT}`
            }
        });
        return res.data.IpfsHash;
    } catch (error) {
        console.log(error);
        return null;
    }
};

export const uploadMetadataOnPinata = async (path: string, stream: any, _metadata: any) => {
    let imageUrl: string | null = null;
    let metadataUri: string | null = null;

    // Upload image
    try {
        const hash = await pinFileToIPFS(path, stream);
        imageUrl = `https://ipfs.io/ipfs/${hash}`;
    } catch (err: any) {
        console.log(`Failed to upload image: ${err.message}`);
        throw new Error(`Failed to upload image: ${err.message}`);
    }

    // Upload metadata
    const metadata = {
        name: _metadata.name,
        symbol: _metadata.symbol,
        description: _metadata.description,
        image: imageUrl,
        website: _metadata.website,
        twitter: _metadata.twitter,
        telegram: _metadata.telegram
    };
    const json = JSON.stringify(metadata);
    try {
        const hash = await pinJSONToIPFS(json);
        metadataUri = `https://ipfs.io/ipfs/${hash}`;
    } catch (err: any) {
        console.log(`Failed to upload json: ${err.message}`);
        throw new Error(`Failed to upload json: ${err.message}`);
    }

    return {imageUrl, metadataUri};
};
