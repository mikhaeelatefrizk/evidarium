import unittest,time,sys
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'companion'))
import jwt
from cryptography.hazmat.primitives.asymmetric import rsa
from evidarium_agent import auth
class AuthTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):cls.key=rsa.generate_private_key(public_exponent=65537,key_size=2048)
    def token(self,**overrides):
        claims={'iss':auth.ISSUER,'aud':'issued-client','sub':'account-a','exp':int(time.time())+300,'nonce':'expected'};claims.update(overrides);return jwt.encode(claims,self.key,algorithm='RS256')
    def validate(self,token,nonce='expected'):
        class Key:pass
        key=Key();key.key=self.key.public_key()
        with patch.object(auth,'discovery',return_value={'jwks_uri':auth.ISSUER+'/jwks'}),patch.object(jwt.PyJWKClient,'get_signing_key_from_jwt',return_value=key):return auth.validate_id(token,'issued-client',nonce)
    def test_valid_signature_and_claims(self):self.assertEqual(self.validate(self.token())['sub'],'account-a')
    def test_wrong_issuer_audience_and_expiry_are_rejected(self):
        for claims in [{'iss':'https://example.invalid'},{'aud':'another-client'},{'exp':1}]:
            with self.subTest(claims=claims),self.assertRaises(jwt.InvalidTokenError):self.validate(self.token(**claims))
    def test_wrong_nonce_is_rejected(self):
        with self.assertRaises(RuntimeError):self.validate(self.token(nonce='wrong'))
    def test_plaintext_credential_backend_is_refused(self):
        class Plaintext:priority=1
        Plaintext.__module__='keyrings.alt.file'
        with patch.object(auth.keyring,'get_keyring',return_value=Plaintext()),self.assertRaises(RuntimeError):auth.backend()
    def response(self,**updates):
        t={'access_token':'synthetic-access','refresh_token':'synthetic-refresh','token_type':'Bearer','scope':auth.SCOPES,'expires_in':3600,'id_token':'synthetic-id'};t.update(updates);return t
    def test_incomplete_tokens_never_become_usable_authorization(self):
        for values in [{'access_token':''},{'refresh_token':''},{'expires_in':0},{'expires_in':True},{'expires_in':float('inf')},{'token_type':'Other'},{'scope':'openid chatgpt.tokens.use.direct'},{'id_token':None}]:
            with self.subTest(values=values),self.assertRaises(RuntimeError):auth.validated_tokens(self.response(**values),'client')
    def test_rotating_refresh_preserves_grant_and_rejects_identity_changes(self):
        old=self.response()
        with patch.object(auth,'validate_id',return_value={'sub':'person-a'}):
            new,claims=auth.validated_tokens({'access_token':'new-synthetic','refresh_token':'rotated-synthetic','expires_in':600},'client',subject='person-a',previous=old)
            self.assertEqual(new['refresh_token'],'rotated-synthetic');self.assertEqual(new['scope'],auth.SCOPES)
            with self.assertRaises(RuntimeError):auth.validated_tokens(self.response(),'client',subject='person-b',previous=old)
if __name__=='__main__':unittest.main()
